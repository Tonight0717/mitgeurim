import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
const coreScript = scripts.find(([, attrs]) => /\bid\s*=\s*["']core["']/i.test(attrs));
assert.ok(coreScript, 'index.html에 id="core" 스크립트가 있어야 합니다.');
const context = vm.createContext({ crypto: { randomUUID }, Date, console });
vm.runInContext(coreScript[2], context, { filename: 'index.html#core' });
const C = context.IdeaCore;
assert.ok(C, 'IdeaCore가 노출되어야 합니다.');

let passed = 0;
let failed = 0;
const plain = value => JSON.parse(JSON.stringify(value));
function test(name, fn) {
  try { fn(); passed++; console.log(`통과 ${String(passed).padStart(2, '0')} · ${name}`); }
  catch (error) { failed++; console.error(`실패 · ${name}\n  ${error.message}`); }
}
function idea(overrides = {}) {
  const item = C.newIdea('offline');
  item.fields = {
    ...item.fields,
    idea: '독서 기록을 저장하고 찾아보는 개인 도구',
    audience: '책을 읽는 직장인',
    platforms: ['모바일', 'PC'],
    features: ['독서 기록 저장', '제목으로 검색', 'JSON 내보내기'],
    constraints: ['유료 API 사용 금지', '크롤링 금지'],
    extraConstraints: '회원가입 없이 사용',
    format: '단일 HTML 웹앱',
    success: '모바일에서 기록을 저장하고 새로고침 후 다시 찾을 수 있다.',
    ...overrides,
  };
  return item;
}
function apiReply(payload, extras = {}) {
  return {
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(payload) }] } }],
    ...extras,
  };
}

test('내장 JavaScript 전체가 문법 검사를 통과한다', () => {
  for (let n = 0; n < scripts.length; n++) {
    if (/type\s*=\s*["'](?:application\/json|importmap)["']/i.test(scripts[n][1])) continue;
    new vm.Script(scripts[n][2], { filename: `index.html#script-${n + 1}` });
  }
});

test('실행에 외부 스크립트·스타일 패키지가 필요하지 않다', () => {
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i);
  assert.doesNotMatch(html, /<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/i);
  assert.match(html, /<html\b[^>]*\blang\s*=\s*["']ko["']/i);
  assert.match(html, /name\s*=\s*["']viewport["']/i);
});

test('새 아이디어는 고유 ID를 가진 독립된 초안이다', () => {
  const a = C.newIdea('offline');
  const b = C.newIdea('ai');
  assert.notEqual(a.id, b.id);
  assert.equal(a.mode, 'offline');
  assert.equal(b.mode, 'ai');
  assert.equal(a.status, 'draft');
  assert.equal(a.step, 0);
  assert.equal(b.ai.turn, 0);
  a.fields.features.push('한 초안에만 추가');
  assert.equal(b.fields.features.length, 0);
});

test('핵심 기능은 최대 세 개로 제한된다', () => {
  const normalized = C.normalizeIdea(idea({ features: ['하나', '둘', '셋', '넷', '다섯'] }));
  assert.equal(normalized.fields.features.length, 3);
  assert.ok(C.buildOutput(normalized).summary.features.length <= 3);
});

test('프롬프트에 사용자 목적·제약·완성 기준이 보존된다', () => {
  const item = idea();
  const output = C.buildOutput(item);
  assert.equal(typeof output.prompt, 'string');
  for (const text of [item.fields.idea, item.fields.audience, item.fields.extraConstraints, item.fields.success, ...item.fields.features]) {
    assert.ok(output.prompt.includes(text), `프롬프트에서 누락됨: ${text}`);
  }
  assert.match(output.prompt, /유료\s*API/);
  assert.match(output.prompt, /크롤링/);
  assert.match(output.prompt, /index\.html/);
  assert.match(output.prompt, /파일\s*구조/);
  assert.match(output.prompt, /테스트|검증/);
  assert.ok(output.checklist.length >= 3);
  assert.ok(output.checklist.every(row => typeof row.id === 'string' && typeof row.text === 'string'));
  assert.equal(new Set(output.checklist.map(row => row.id)).size, output.checklist.length);
});

test('입력하지 않은 정보는 확정 사실처럼 조립하지 않는다', () => {
  const output = C.buildOutput(C.newIdea('offline'));
  assert.match(output.prompt, /미정|확인|가정|정하지|입력/);
  assert.doesNotMatch(output.prompt, /undefined|\[object Object\]/);
});

test('원하는 형태에 맞는 파일 구조와 검증 명령을 제안한다', () => {
  const python = C.buildOutput(idea({ format: 'Python 스크립트' })).prompt;
  assert.match(python, /main\.py/);
  assert.match(python, /python -m unittest/);
  assert.doesNotMatch(python, /단일 index\.html로 구현/);
  const mobile = C.buildOutput(idea({ format: '모바일 앱' })).prompt;
  assert.match(mobile, /모바일.*기술|모바일 앱/);
  assert.match(mobile, /빌드 방법/);
  assert.doesNotMatch(mobile, /단일 index\.html로 구현/);
  const spec = C.buildOutput(idea({ format: '설계 문서' })).prompt;
  assert.match(spec, /SPEC\.md/);
  assert.match(spec, /PROMPT\.md/);
});

test('현실성 점검은 비용·외부 접근·범위를 다룬다', () => {
  const warnings = C.getWarnings(idea({ idea: '여러 쇼핑몰을 크롤링하고 결제·실시간 채팅·AI 이미지 생성을 제공하는 플랫폼' }));
  assert.ok(Array.isArray(warnings));
  assert.ok(warnings.length >= 3);
  const combined = warnings.map(w => `${w.title} ${w.detail}`).join('\n');
  assert.match(combined, /API|비용|유료/);
  assert.match(combined, /차단|로그인|CORS|외부/);
  assert.match(combined, /범위|규모|단계/);
  assert.ok(warnings.every(w => ['warning', 'info'].includes(w.level)));
});

test('JSON 내보내기는 API 키·설정을 포함하지 않는다', () => {
  const item = idea();
  item.apiKey = 'fake-secret-DO-NOT-EXPORT';
  item.settings = { apiKey: 'fake-secret-DO-NOT-EXPORT' };
  item.fields.apiKey = 'fake-secret-DO-NOT-EXPORT';
  const exported = plain(C.exportData([item]));
  assert.equal(exported.version, 1);
  assert.equal(exported.ideas.length, 1);
  assert.ok(!JSON.stringify(exported).includes('fake-secret-DO-NOT-EXPORT'));
  assert.equal(exported.ideas[0].fields.idea, item.fields.idea);
});

test('내보낸 초안을 다시 가져와도 작성 내용이 보존된다', () => {
  const item = idea();
  item.step = 3;
  item.ai.draftAnswer = '아직 전송하지 않은 답변';
  const restored = C.normalizeImport(plain(C.exportData([item])));
  const imported = Array.isArray(restored) ? restored : restored.ideas;
  assert.equal(imported.length, 1);
  assert.equal(imported[0].fields.idea, item.fields.idea);
  assert.deepEqual(plain(imported[0].fields.features), plain(item.fields.features));
  assert.equal(imported[0].step, 3);
  assert.equal(imported[0].ai.draftAnswer, item.ai.draftAnswer);
});

test('손상되거나 다른 형식인 가져오기 파일은 거부한다', () => {
  for (const bad of [null, [], {}, { version: 999, ideas: [] }, { version: 1, ideas: '문자열' }, { version: 1, ideas: [null] }]) {
    assert.throws(() => C.normalizeImport(bad), `거부되지 않은 파일: ${JSON.stringify(bad)}`);
  }
});

test('중복 ID와 200개를 초과하는 가져오기는 거부한다', () => {
  const item = idea();
  assert.throws(() => C.normalizeImport({ version: 1, ideas: [item, item] }));
  assert.throws(() => C.normalizeImport({ version: 1, ideas: Array.from({ length: 201 }, () => idea()) }));
});

test('JSON의 임의 키를 프로그램 객체에 복사하지 않는다', () => {
  const source = JSON.parse(JSON.stringify(idea()));
  source.__proto__ = { polluted: 'yes' };
  source.fields.untrustedProperty = 'drop-me';
  source.settings = { apiKey: 'never-import-this' };
  const clean = C.normalizeIdea(source);
  assert.equal(clean.fields.untrustedProperty, undefined);
  assert.equal(clean.settings, undefined);
  assert.equal({}.polluted, undefined);
});

test('출력용 HTML escaping이 사용자 마크업을 비활성화한다', () => {
  const escaped = C.escapeHTML('<img src=x onerror="alert(1)"> & \'');
  assert.ok(!escaped.includes('<img'));
  assert.ok(escaped.includes('&lt;'));
  assert.ok(escaped.includes('&amp;'));
});

test('Gemini 요청은 구조화 JSON을 요청하고 API 키를 본문에 넣지 않는다', () => {
  const item = idea();
  item.mode = 'ai';
  item.apiKey = 'fake-secret-DO-NOT-SEND-IN-BODY';
  const request = C.buildAIRequest(item);
  assert.equal(request.generationConfig.responseMimeType, 'application/json');
  assert.ok(request.generationConfig.responseSchema);
  const serialized = JSON.stringify(request);
  assert.ok(serialized.includes(item.fields.idea));
  assert.ok(!serialized.includes('fake-secret-DO-NOT-SEND-IN-BODY'));
});

test('짧은 답변도 해석할 수 있도록 현재 질문을 함께 보낸다', () => {
  const item = idea();
  item.mode = 'ai';
  item.ai.turn = 1;
  item.ai.questions = ['로그인 없이 기기 안에만 저장해도 될까요?'];
  item.ai.draftAnswer = '네';
  const request = C.buildAIRequest(item);
  const content = JSON.parse(request.contents[0].parts[0].text);
  assert.deepEqual(plain(content.currentQuestions), item.ai.questions);
  assert.equal(content.latestAnswer, '네');
});

test('유효한 Gemini 응답을 읽고 기존 입력을 유지한다', () => {
  const item = idea();
  item.mode = 'ai';
  const result = C.parseAIResponse(apiReply({
    done: false,
    questions: ['검색 결과는 어떤 순서로 보여줄까요?', '완성됐다고 판단할 기준은 무엇인가요?'],
    fields: { audience: item.fields.audience },
    assumptions: [],
  }), item);
  assert.equal(result.done, false);
  assert.equal(result.questions.length, 2);
  assert.equal(result.fields.idea, item.fields.idea);
});

test('네 번째 AI 응답에서는 추가 질문 없이 정리한다', () => {
  const item = idea();
  item.mode = 'ai';
  item.ai.turn = 3;
  const result = C.parseAIResponse(apiReply({
    done: false,
    questions: ['다섯 번째 대화를 시작할까요?'],
    fields: item.fields,
    assumptions: [],
  }), item);
  assert.equal(result.done, true);
  assert.equal(result.questions.length, 0);
});

test('AI는 한 번에 질문 한두 개만 반환해야 한다', () => {
  const item = idea();
  const one = C.parseAIResponse(apiReply({ done: false, questions: ['누구를 위한 도구인가요?'], fields: {}, assumptions: [] }), item);
  assert.equal(one.questions.length, 1);
  for (const questions of [[], ['첫 질문', '둘째 질문', '셋째 질문']]) {
    assert.throws(() => C.parseAIResponse(apiReply({ done: false, questions, fields: {}, assumptions: [] }), item));
  }
});

test('AI가 제약을 누락하더라도 사용자가 금지한 조건을 유지한다', () => {
  const item = idea();
  const result = C.parseAIResponse(apiReply({ done: true, questions: [], fields: { constraints: [] }, assumptions: [] }), item);
  for (const constraint of item.fields.constraints) assert.ok(result.fields.constraints.includes(constraint));
});

test('답변으로 해소된 이전 AI 가정은 최신 결과에서 지운다', () => {
  const item = idea();
  item.fields.assumptions = ['대상 사용자는 아직 미정이다.'];
  const result = C.parseAIResponse(apiReply({ done: true, questions: [], fields: { audience: '책을 읽는 직장인' }, assumptions: [] }), item);
  assert.deepEqual(plain(result.fields.assumptions), []);
});

test('AI가 확인한 추가 제약을 기존 제약과 함께 중복 없이 보존한다', () => {
  const item = idea({ extraConstraints: '회원가입 없이 사용' });
  const reply = apiReply({ done: true, questions: [], fields: { extraConstraints: '매달 운영비가 들지 않게' }, assumptions: [] });
  const first = C.parseAIResponse(reply, item);
  assert.ok(first.fields.extraConstraints.includes('회원가입 없이 사용'));
  assert.ok(first.fields.extraConstraints.includes('매달 운영비가 들지 않게'));
  item.fields = first.fields;
  const second = C.parseAIResponse(reply, item);
  assert.equal(second.fields.extraConstraints, first.fields.extraConstraints);
});

test('비정상·잘린·안전 차단 AI 응답은 성공으로 처리하지 않는다', () => {
  const item = idea();
  const badReplies = [
    {},
    { promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: '{}' }] } }] },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"done":' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'JSON이 아닌 응답' }] } }] },
    apiReply({}),
  ];
  for (const reply of badReplies) assert.throws(() => C.parseAIResponse(reply, item));
});

console.log(`\n${passed}개 통과${failed ? ` / ${failed}개 실패` : ' · 모든 검사 통과'}`);
if (failed) process.exitCode = 1;
