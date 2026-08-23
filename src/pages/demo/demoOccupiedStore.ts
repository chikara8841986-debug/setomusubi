import { useSyncExternalStore } from 'react'
import { INITIAL_DEMO_OCCUPIED_SLOTS, type DemoOccupiedSlot } from './demoData'

/**
 * デモ用の「占有時間」共有ストア。
 *
 * なぜ必要か:
 * 以前は事業所カレンダーとMSW検索がそれぞれ独立して useState を持っていたため、
 * カレンダーで塗った時間がMSW検索に反映されなかった。
 * それにもかかわらずデモ画面には「ここで塗った時間はMSWの検索結果から自動で除外されます。
 * MSW視点で見るには…」という案内が出ており、案内どおりに操作すると反映されておらず、
 * デモが壊れているように見えていた。
 *
 * ページ遷移をまたいで状態を共有する必要があるため、モジュールレベルで保持する。
 * （デモなのでDBもContextも使わない。ブラウザを再読み込みすれば初期状態に戻る）
 */

let slots: DemoOccupiedSlot[] = INITIAL_DEMO_OCCUPIED_SLOTS
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getSnapshot() {
  return slots
}

/** useState の setter と同じ書き味で使える更新関数。 */
export function setDemoOccupiedSlots(
  next: DemoOccupiedSlot[] | ((prev: DemoOccupiedSlot[]) => DemoOccupiedSlot[]),
) {
  const resolved = typeof next === 'function' ? next(slots) : next
  if (resolved === slots) return
  slots = resolved
  listeners.forEach((listener) => listener())
}

/** 現在の占有時間を購読する。どのデモ画面から呼んでも同じデータを見る。 */
export function useDemoOccupiedSlots(): DemoOccupiedSlot[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** デモを初期状態に戻す。 */
export function resetDemoOccupiedSlots() {
  setDemoOccupiedSlots(INITIAL_DEMO_OCCUPIED_SLOTS)
}
