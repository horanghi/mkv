/**
 * 이 꾸러미가 어느 빌드에서 나왔는가.
 *
 * 게이트는 "이 게임이 공정한가"를 묻는데, 빌드가 다르면 다른 게임이다.
 * 밸런스를 한 번 만지고 나면 그 전후의 재시도율은 같은 질문에 대한 답이
 * 아니다. 어느 쪽인지 적어 두지 않으면 합칠 때 알 수가 없다.
 *
 * 배포 경로가 둘 이상이면(민찬 게임랜드에 옮긴 빌드와 자체 배포) 두 곳이
 * 조용히 어긋날 수 있다. 그때 이 값이 갈린다.
 *
 * 값은 **번들 파일 이름의 내용 해시**다. 빌드 도구가 이미 내용으로 만들어
 * 주는 것이라, 같은 코드는 같은 값이 되고 한 글자만 바뀌어도 달라진다.
 * 따로 심는 버전 문자열과 달리 갱신을 잊을 수가 없다.
 */

/** 해시를 못 읽었을 때. 개발 서버에는 해시가 없다. */
export const UNKNOWN_BUILD = 'dev'

/**
 * 모듈 URL 에서 내용 해시를 뽑는다.
 *
 * 빌드 결과는 `/assets/index-BYhFgpeH.js` 꼴이다. 개발 서버는
 * `/src/telemetry/build.ts` 라 해시가 없고, 그때는 `dev` 로 둔다.
 */
export function buildIdFrom(moduleUrl: string): string {
  const file = moduleUrl.split('/').pop() ?? ''
  const match = /^index-([A-Za-z0-9_-]{6,})\.js$/.exec(file)
  return match?.[1] ?? UNKNOWN_BUILD
}

/** 지금 돌고 있는 빌드의 식별자. */
export function buildId(): string {
  return buildIdFrom(import.meta.url)
}
