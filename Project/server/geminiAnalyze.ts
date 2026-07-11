import type { IncomingMessage, ServerResponse } from 'node:http';

interface AnalyzeBody {
  imageBase64?: string;
  mimeType?: string;
}

interface GeminiPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
  error?: {
    message?: string;
  };
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const MAX_BODY_BYTES = 8 * 1024 * 1024;

const geminiToken = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

const collectBody = async (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('이미지 용량이 너무 큽니다. 8MB 이하 파일로 다시 시도해 주세요.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

const cleanJsonText = (text: string) =>
  text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const parseGeminiJson = (text: string) => {
  const cleaned = cleanJsonText(text);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('Gemini 응답에서 JSON을 찾지 못했습니다.');
  return JSON.parse(cleaned.slice(start, end + 1));
};

const prompt = `
너는 반려동물 보험금 청구 준비를 돕는 문서 분석 보조자다.
업로드된 동물병원 문서 이미지를 읽고 아래 JSON만 반환해라.
최종 보장 여부를 단정하지 말고, 문서에서 확인되는 단서만 근거로 삼아라.

반환 JSON 스키마:
{
  "docType": "진료비 영수증 | 진료비 세부내역서 | 진단서/소견서 | 진료기록부 | 기타",
  "date": "YYYY.MM.DD 또는 빈 문자열",
  "diag": "병명 또는 진료 내용. 진료비 영수증이라 확인 어려우면 빈 문자열",
  "cost": "총 진료비. 숫자와 쉼표만, 예: 350,000. 못 찾으면 빈 문자열",
  "surgery": true 또는 false,
  "claimType": "illness | injury | preventive | skin | procedure | surgery | manual",
  "summary": "사용자에게 보여줄 짧은 한국어 분석 요약",
  "evidence": ["판단 근거 키워드"],
  "warnings": ["확인 필요 사항"]
}

분류 기준:
- 사고, 외상, 골절, 물림, 추락 등은 injury
- 아토피, 피부, 피부염, 알레르기 등은 skin
- 수술, 마취, 입원, 절제, 봉합 등은 surgery
- 초음파, 혈액검사, X-ray, CT, MRI 등 검사 중심이면 procedure
- 예방접종, 백신, 건강검진, 미용, 중성화 등은 preventive
- 치료제, 처방, 진료, 구토, 설사, 염증, 감염 등은 illness
- 단서가 부족하면 manual
`;

const requestGemini = async (body: AnalyzeBody) => {
  const apiKey = geminiToken();
  if (!apiKey) throw new Error('GEMINI_API_KEY 또는 GOOGLE_API_KEY가 없습니다.');
  if (!body.imageBase64 || !body.mimeType) throw new Error('분석할 이미지가 없습니다.');

  const parts: GeminiPart[] = [
    { text: prompt },
    {
      inline_data: {
        mime_type: body.mimeType,
        data: body.imageBase64,
      },
    },
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  const data = (await response.json().catch(() => ({}))) as GeminiResponse;
  if (!response.ok) throw new Error(data.error?.message || 'Gemini 분석 요청에 실패했습니다.');

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
  return parseGeminiJson(text);
};

export async function handleGeminiAnalyze(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const rawBody = await collectBody(req);
    const body = JSON.parse(rawBody || '{}') as AnalyzeBody;
    const result = await requestGemini(body);
    sendJson(res, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, { error: message });
  }
}
