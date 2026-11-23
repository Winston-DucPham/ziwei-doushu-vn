import { Solar } from 'lunar-javascript';
import { lunarMonthDayCount } from '@/lib/ziwei/lunar-solar';
import { getLiuNianSiHua, getLiuYueSiHua, getYearStemIndex } from '@/lib/ziwei/sihua';
import { BRANCHES } from '@/lib/ziwei/constants';
import { getDaXianIndexForYear } from '@/lib/ziwei/yunxian-context';
import type { ZiweiChart } from '@/lib/ziwei/types';
import type { ChatTurn } from './cli-providers';

const monthNames = ['gieng', 'hai', 'ba', 'tu', 'nam', 'sau', 'bay', 'tam', 'chin', 'muoi', 'muoi mot', 'chap'];
const monthPattern = /\bthang\s+(\d{1,2}|gieng|mot|hai|ba|tu|bon|nam|sau|bay|tam|chin|muoi hai|muoi mot|muoi|chap)\b/;
const lunarCalendar = /\b(am|luu nguyet|nhuan)\b/;
const yearOnly = /^(?:nam\s+)?((?:19|20)\d{2})[.!?\s]*$/;

function normalize(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').trim();
}

function monthOf(text: string) {
  const term = monthPattern.exec(text)?.[1];
  if (!term) return undefined;
  if (/^\d/.test(term)) return Number(term);
  if (term === 'mot') return 1;
  if (term === 'bon') return 4;
  if (term === 'muoi hai') return 12;
  return monthNames.indexOf(term) + 1;
}

function yearOf(text: string) {
  const bare = yearOnly.exec(text);
  const period = /\b(?:nam|am(?: lich)?|luu nien)\s+((?:19|20)\d{2})\b/.exec(text);
  const monthYear = /\bthang\s+\d{1,2}\s*[/\-]\s*((?:19|20)\d{2})\b/.exec(text);
  const value = (bare ?? monthYear ?? period)?.[1];
  return value ? Number(value) : undefined;
}

function currentLunarYear() {
  const date = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [year, month, day] = date.split('-').map(Number);
  return Solar.fromYmd(year, month, day).getLunar().getYear();
}

/** Only user-specified periods select overlays; assistant citations are never dates of reference. */
export function lunarMonthContext(chart: ZiweiChart, messages: ChatTurn[]) {
  const turns = messages.filter(m => m.role === 'user').map(m => normalize(m.content)).reverse();
  const [latest, previous = ''] = turns;
  if (!latest) return;
  const previousWasLunar = lunarCalendar.test(previous) && monthOf(previous) !== undefined;
  const refersBack = previousWasLunar && (yearOnly.test(latest) || /\bthang (do|ay)\b/.test(latest));
  const period = refersBack ? previous : latest;
  if (!lunarCalendar.test(period) && !(previousWasLunar && !period.includes('duong'))) return;

  const month = monthOf(period);
  if (!month || month > 12) return;
  const priorPeriod = turns.slice(1).find(t => !/\bsinh\b/.test(t) &&
    (yearOnly.test(t) || /\b(nam|luu nien|thang)\b/.test(t)) && yearOf(t));
  const specified = yearOf(latest) ?? (/\bnam nay\b/.test(latest) ? currentLunarYear() : yearOf(priorPeriod ?? ''));
  const year = specified ?? currentLunarYear();
  const leap = /\bnhuan\b/.test(period);
  const days = lunarMonthDayCount(year, month, leap);
  if (!days) return { 年: year, 月: month, 闰月: leap, 状态: '此年月不在历表内或不存在，不能排流月。' };

  const yearBranch = (year - 4) % 12;
  const palaceAt = (branch: number) => chart.palaces.find(p => p.branch === branch)?.name;
  const dx = chart.daXians[getDaXianIndexForYear(chart, year)];
  const placements = (transforms: Record<string, string>) => Object.entries(transforms).map(([化, 星]) => ({
    化, 星, 本命宫: chart.palaces.find(p => p.stars.some(s => s.name === 星))?.name,
  }));
  const overlay = (day: number) => {
    const flow = getLiuYueSiHua(getYearStemIndex(year), month, {
      isLeapMonth: leap, liuriDay: day, nextYearStem: getYearStemIndex(year + 1),
    });
    // Đẩu Quân: từ chi lưu niên lùi theo tháng sinh, tiến theo giờ sinh và tháng đang xem.
    const monthBranch = (yearBranch - Math.abs(chart.lunarInfo.lunarMonth) + chart.birthInfo.hour
      + month + (leap && day > 15 ? 1 : 0) + 12) % 12;
    return {
      流月命宫: { 地支: BRANCHES[monthBranch], 本命宫: palaceAt(monthBranch),
        对宫: palaceAt((monthBranch + 6) % 12), 三合: [palaceAt((monthBranch + 4) % 12), palaceAt((monthBranch + 8) % 12)] },
      月干: flow.stemName,
      四化: placements(flow.transforms),
    };
  };
  return {
    年: year, 月: month, 闰月: leap, 默认当年: specified === undefined,
    所问年大限: dx && { 宫: dx.palaceName, 起岁: dx.startAge, 止岁: dx.endAge },
    流年: { 命宫地支: BRANCHES[yearBranch], 本命宫: palaceAt(yearBranch), 四化: placements(getLiuNianSiHua(year).transforms) },
    ...(leap ? { 初一至十五: overlay(1), 十六至月底: overlay(16) } : overlay(1)),
  };
}
