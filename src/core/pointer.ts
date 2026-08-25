/**
 * 이 기기로 이 게임을 조작할 수 있는가.
 *
 * 조작이 키보드뿐이라 폰에서는 열려도 아무것도 못 한다. 그대로 두면
 * 테스터는 가만히 서 있는 화면을 보다 닫는다 — 사망이 없으니 결과를
 * 보내는 버튼도 뜨지 않아, **한 명이 조용히 사라진다.**
 * 게이트가 다섯 명을 요구하는 이상 그 한 명이 비싸다.
 *
 * → prompts/m1-gate-testers.md
 */

/** `window.matchMedia(q).matches` 를 넣는다. 브라우저 없이 테스트하려고 뺐다. */
export type MediaQuery = (query: string) => boolean

/**
 * 키보드가 없다고 알려야 하는가.
 *
 * 터치가 된다는 것만으로는 부족하다 — 터치스크린 노트북은 키보드가 있다.
 * **정밀 포인터가 하나도 없을 때만** 참이다.
 */
export function needsKeyboardNotice(matches: MediaQuery): boolean {
  return matches('(pointer: coarse)') && !matches('(any-pointer: fine)')
}

/** 브라우저에서 쓰는 기본 구현. `matchMedia` 가 없는 환경에서도 죽지 않는다. */
export function browserMediaQuery(): MediaQuery {
  return (query) => {
    try {
      return typeof matchMedia === 'function' && matchMedia(query).matches
    } catch {
      // 오래된 브라우저. 안내를 띄우지 않는 쪽으로 떨어진다 —
      // 못 하는 사람을 놓치는 것보다 되는 사람을 막는 쪽이 나쁘다.
      return false
    }
  }
}
