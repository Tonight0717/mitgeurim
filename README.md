# 밑그림 (mitgeurim)

아이디어를 질문으로 구체화해 Codex에 바로 붙여넣을 설계서·프롬프트로 만들어 주는 단일 HTML 웹앱입니다. 키 없이 쓰는 '가이드' 모드와 Gemini와 대화하는 'AI' 모드가 있습니다.
공개 주소: https://tonight0717.github.io/mitgeurim/

## 사용
이 앱은 빌드·설치가 필요 없다. `index.html` 한 파일이 전부다. AI 모드는 [Google AI Studio](https://aistudio.google.com/apikey)에서 무료 키를 발급해 '연결 설정'에 넣으면 된다. 기본 모델·무료 한도는 바뀔 수 있으니 연결 설정에서 모델명을 확인하고, 무료 한도가 있는 Flash-Lite 계열을 권장한다.

## 배포
GitHub Pages로 배포되어 있다. 다시 배포할 때는 두 갈래다.
- (A) 공개 저장소: Settings → General → 맨 아래 Danger Zone → Change visibility → public, 이어서 Settings → Pages → Deploy from a branch → main / (root) → Save. 1~2분 뒤 `https://<사용자>.github.io/mitgeurim/` 주소가 열린다. 공개하면 누구나 접속할 수 있고 코드도 공개된다.
- (B) 비공개 유지: 저장소를 내려받아 `index.html`을 더블클릭해 열거나(파일 하나로 실행), Cloudflare Pages·Netlify 같은 정적 호스팅에 드래그해 올린다. 무료 플랜의 GitHub Pages는 비공개 저장소를 지원하지 않는다.

## 개인정보
Gemini API 키는 이 브라우저의 localStorage에만 저장되고 JSON 내보내기에는 포함되지 않는다. AI를 쓸 때만 키와 현재 아이디어·답변이 Google Gemini로 전송되며 그 외 서버로는 보내지 않는다. 브라우저 데이터를 지우면 아이디어도 사라지니 JSON으로 백업한다.

## 검증
Node 18 이상에서 `node test.mjs`를 실행한다. 2026-11-19 기준 Node v22.11.0에서 `28개 통과 · 모든 검사 통과`.
