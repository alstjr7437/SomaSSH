import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ClaimType = 'illness' | 'injury' | 'preventive' | 'skin' | 'procedure' | 'surgery' | 'manual';
type DocKind = 'hospital' | 'self';

interface ResultDoc {
  name: string;
  desc: string;
  tag: string;
  tagKind: DocKind;
}

interface Guide {
  claimType: ClaimType;
  title: string;
  source: 'notion' | 'fallback';
  hospitalDocs: ResultDoc[];
  selfDocs: ResultDoc[];
  notes: string[];
  warning?: string;
}

interface NotionProperty {
  type?: string;
  title?: { plain_text?: string }[];
  rich_text?: { plain_text?: string }[];
  select?: { name?: string };
  multi_select?: { name?: string }[];
  status?: { name?: string };
  checkbox?: boolean;
  url?: string;
  formula?: { string?: string; number?: number; boolean?: boolean };
}

interface NotionPage {
  properties?: Record<string, NotionProperty>;
}

interface NotionQueryResponse {
  message?: string;
  results?: NotionPage[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const NOTION_VERSION = '2022-06-28';

const CLAIM_LABELS: Record<ClaimType, string[]> = {
  illness: ['질병', '질병 통원', '질병통원', 'illness'],
  injury: ['상해', '사고', '상해 통원', '상해통원', 'injury'],
  preventive: ['예방', '검진', '예방/검진', '예방검진', 'preventive'],
  skin: ['피부', '아토피', '피부/아토피', '피부아토피', 'skin'],
  procedure: ['검사', '처치', '검사/처치', '검사처치', 'procedure'],
  surgery: ['수술', '입원', '수술/입원', 'surgery'],
  manual: ['수동 확인', '수동확인', 'manual'],
};

const fallbackDoc = (name: string, desc: string, tag: string, tagKind: DocKind): ResultDoc => ({
  name,
  desc,
  tag,
  tagKind,
});

const FALLBACK_GUIDES: Record<ClaimType, Guide> = {
  illness: {
    claimType: 'illness',
    title: '질병 통원/진료비 청구 준비 서류',
    source: 'fallback',
    hospitalDocs: [
      fallbackDoc('진료비 영수증', '방금 올린 문서예요. 원본을 보관해두면 좋아요.', '업로드됨', 'hospital'),
      fallbackDoc('진료 상세 내역서', '진료 항목·금액을 확인하는 공통 서류예요.', '병원 발급', 'hospital'),
      fallbackDoc('처방전 또는 약제 내역', '약 처방이 있으면 함께 챙겨주세요.', '병원 발급', 'hospital'),
    ],
    selfDocs: [
      fallbackDoc('보험금청구서', '가입 보험사 앱이나 홈페이지 양식을 작성해요.', '보험사 양식', 'self'),
      fallbackDoc('개인정보처리동의서', '청구서와 함께 제출하는 공통 서류예요.', '보험사 양식', 'self'),
    ],
    notes: ['보험사와 상품에 따라 면책기간, 기존 질환, 보장 제외 항목이 다를 수 있어요.'],
  },
  injury: {
    claimType: 'injury',
    title: '상해/사고성 통원 청구 준비 서류',
    source: 'fallback',
    hospitalDocs: [
      fallbackDoc('진료비 영수증', '치료 비용 확인용 서류예요.', '업로드됨', 'hospital'),
      fallbackDoc('진료 상세 내역서', '진료 항목과 처치 내용을 확인해요.', '병원 발급', 'hospital'),
      fallbackDoc('진단서 또는 소견서', '상해 내용과 치료 필요성을 확인하는 자료예요.', '병원 발급', 'hospital'),
    ],
    selfDocs: [
      fallbackDoc('보험금청구서', '가입 보험사 양식을 작성해요.', '보험사 양식', 'self'),
      fallbackDoc('사고 경위 메모', '언제, 어디서, 어떻게 다쳤는지 정리해두면 좋아요.', '직접 작성', 'self'),
    ],
    notes: ['사고 일시와 경위가 확인되면 상해 청구 준비에 도움이 돼요.'],
  },
  preventive: {
    claimType: 'preventive',
    title: '예방·건강검진성 항목 확인 서류',
    source: 'fallback',
    hospitalDocs: [
      fallbackDoc('진료비 영수증', '비용 확인용 서류예요.', '업로드됨', 'hospital'),
      fallbackDoc('진료 상세 내역서', '검사와 처치 목적을 확인해요.', '병원 발급', 'hospital'),
    ],
    selfDocs: [
      fallbackDoc('보험사 약관 확인', '예방·검진·미용성 항목은 제외될 수 있어요.', '확인 필요', 'self'),
    ],
    notes: ['치료 목적 검사인지 단순 검진인지에 따라 보장 판단이 달라질 수 있어요.'],
  },
  skin: {
    claimType: 'skin',
    title: '피부·아토피 치료 청구 준비 서류',
    source: 'fallback',
    hospitalDocs: [
      fallbackDoc('진료비 영수증', '치료 비용 확인용 서류예요.', '업로드됨', 'hospital'),
      fallbackDoc('진료 상세 내역서', '피부 치료 항목과 약제 내역을 확인해요.', '병원 발급', 'hospital'),
      fallbackDoc('처방전 또는 약제 내역', '아토피·피부염 약 처방이 있으면 함께 제출해요.', '병원 발급', 'hospital'),
    ],
    selfDocs: [
      fallbackDoc('보험금청구서', '가입 보험사 양식을 작성해요.', '보험사 양식', 'self'),
      fallbackDoc('개인정보처리동의서', '청구서와 함께 제출하는 공통 서류예요.', '보험사 양식', 'self'),
    ],
    notes: ['아토피, 피부염, 알레르기 치료는 질병 통원으로 접수하는 흐름이 자연스러워요.'],
  },
  procedure: {
    claimType: 'procedure',
    title: '검사·처치 포함 청구 준비 서류',
    source: 'fallback',
    hospitalDocs: [
      fallbackDoc('진료비 영수증', '비용 확인용 서류예요.', '업로드됨', 'hospital'),
      fallbackDoc('진료 상세 내역서', '검사·처치 항목을 확인해요.', '병원 발급', 'hospital'),
      fallbackDoc('검사 결과지', '초음파, 혈액검사, X-ray 등이 있으면 챙겨주세요.', '병원 발급', 'hospital'),
    ],
    selfDocs: [
      fallbackDoc('보험금청구서', '가입 보험사 양식을 작성해요.', '보험사 양식', 'self'),
    ],
    notes: ['치료 목적 검사인지 단순 검진인지 확인이 필요할 수 있어요.'],
  },
  surgery: {
    claimType: 'surgery',
    title: '수술/입원 청구 준비 서류',
    source: 'fallback',
    hospitalDocs: [
      fallbackDoc('진료비 영수증', '비용 확인용 서류예요.', '업로드됨', 'hospital'),
      fallbackDoc('진료 상세 내역서', '수술·마취·입원 항목을 확인해요.', '병원 발급', 'hospital'),
      fallbackDoc('진단서', '상병명과 수술 필요성을 확인하는 서류예요.', '병원 발급', 'hospital'),
      fallbackDoc('수술기록지', '수술 청구 심사에 필요한 서류예요.', '병원 발급', 'hospital'),
      fallbackDoc('입·퇴원확인서', '입원을 동반했다면 함께 챙겨주세요.', '입원 시', 'hospital'),
    ],
    selfDocs: [
      fallbackDoc('보험금청구서', '가입 보험사 양식을 작성해요.', '보험사 양식', 'self'),
      fallbackDoc('개인정보처리동의서', '청구서와 함께 제출하는 공통 서류예요.', '보험사 양식', 'self'),
      fallbackDoc('통장 사본', '보험금을 받을 계좌 확인용이에요.', '첫 청구 시', 'self'),
    ],
    notes: ['수술·입원 청구는 보험사별 추가 서류 요청 가능성이 높아요.'],
  },
  manual: {
    claimType: 'manual',
    title: '수동 확인 필요',
    source: 'fallback',
    hospitalDocs: [
      fallbackDoc('진료비 영수증', '비용 확인용 서류예요.', '업로드됨', 'hospital'),
      fallbackDoc('진료 상세 내역서', '진료 항목과 내원 사유를 확인해요.', '병원 발급', 'hospital'),
    ],
    selfDocs: [
      fallbackDoc('보험사 상담 또는 앱 확인', '청구 유형이 애매하면 보험사 기준을 먼저 확인하세요.', '확인 필요', 'self'),
    ],
    notes: ['진단명이나 내원 사유가 보이는 자료를 추가하면 판단이 좋아져요.'],
  },
};

const loadEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) return;

  fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const index = line.indexOf('=');
      if (index === -1) return;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = value;
    });
};

const extractNotionId = (value = '') => {
  const compact = value.match(/[0-9a-fA-F]{32}/)?.[0];
  if (compact) {
    return compact.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  }
  return value.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)?.[0] || '';
};

const notionDatabaseId = () =>
  extractNotionId(process.env.NOTION_DATABASE_ID || process.env.NOTION_DATABASE_URL || '');

const notionToken = () =>
  process.env.NOTION_INTEGRATION_TOKEN ||
  process.env.NOTION_INTERGRATION_TOKEN ||
  process.env.NOTION_API_KEY ||
  '';

const propertyText = (property?: NotionProperty) => {
  if (!property) return '';
  if (property.type === 'title') return property.title?.map((item) => item.plain_text || '').join('').trim() || '';
  if (property.type === 'rich_text') return property.rich_text?.map((item) => item.plain_text || '').join('').trim() || '';
  if (property.type === 'select') return property.select?.name || '';
  if (property.type === 'multi_select') return property.multi_select?.map((item) => item.name || '').join(', ') || '';
  if (property.type === 'status') return property.status?.name || '';
  if (property.type === 'checkbox') return property.checkbox ? 'true' : 'false';
  if (property.type === 'url') return property.url || '';
  if (property.type === 'formula') {
    const formula = property.formula;
    return String(formula?.string || formula?.number || formula?.boolean || '');
  }
  return '';
};

const firstProperty = (properties: Record<string, NotionProperty>, names: string[]) => {
  const normalized = names.map((name) => name.toLowerCase());
  return Object.entries(properties).find(([name]) => normalized.includes(name.toLowerCase()))?.[1];
};

const listFromProperty = (properties: Record<string, NotionProperty>, names: string[]) =>
  propertyText(firstProperty(properties, names))
    .split(/\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);

const notesFromProperty = (properties: Record<string, NotionProperty>, names: string[]) =>
  propertyText(firstProperty(properties, names))
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);

const docsFromProperty = (
  properties: Record<string, NotionProperty>,
  names: string[],
  tag: string,
  tagKind: DocKind,
) =>
  listFromProperty(properties, names).map((name) => ({
    name,
    desc: tagKind === 'hospital' ? 'Notion DB에서 불러온 병원 발급 서류예요.' : 'Notion DB에서 불러온 직접 준비 서류예요.',
    tag,
    tagKind,
  }));

const isActivePage = (page: NotionPage) => {
  const property = firstProperty(page.properties || {}, ['활성화', '활성', 'active', 'enabled']);
  if (!property) return true;
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  const value = propertyText(property).toLowerCase();
  return !['false', 'no', '비활성', 'inactive', 'disabled'].includes(value);
};

const matchesClaimType = (page: NotionPage, claimType: ClaimType) => {
  const labels = CLAIM_LABELS[claimType] || [claimType];
  const values = Object.entries(page.properties || {})
    .filter(([name]) => /청구|유형|claim|type/i.test(name))
    .map(([, property]) => propertyText(property).toLowerCase())
    .join(' ');

  return labels.some((label) => values.includes(label.toLowerCase()));
};

const insurerAliases = (insurer = '') => {
  const text = insurer.toLowerCase();
  const aliases = ['공통'];
  if (text.includes('메리츠') || text.includes('펫퍼민트')) aliases.push('메리츠', '펫퍼민트');
  if (text.includes('삼성')) aliases.push('삼성화재', '삼성');
  if (text.includes('db') || text.includes('디비')) aliases.push('DB손해보험', 'DB 손보', 'DB');
  if (text.includes('현대')) aliases.push('현대해상', '현대');
  if (text.includes('카카오')) aliases.push('카카오페이손해보험', '카카오');
  if (text.includes('kb') || text.includes('케이비')) aliases.push('KB손해보험', 'KB');
  if (text.includes('마이브라운')) aliases.push('마이브라운');
  return aliases;
};

const insurerScore = (page: NotionPage, insurer = '') => {
  const value = propertyText(firstProperty(page.properties || {}, ['보험사', 'insurer'])).toLowerCase();
  if (!value) return 1;
  const aliases = insurerAliases(insurer).map((item) => item.toLowerCase());
  const exactAlias = aliases.find((alias) => alias !== '공통' && value.includes(alias));
  if (exactAlias) return 3;
  if (value.includes('공통')) return 2;
  return 0;
};

const pageToGuide = (page: NotionPage, claimType: ClaimType): Guide => {
  const properties = page.properties || {};
  const fallback = FALLBACK_GUIDES[claimType];
  const hospitalDocs = docsFromProperty(properties, ['병원서류', '병원 서류', '필수서류', '필수 서류', 'hospitalDocs'], '병원 발급', 'hospital');
  const selfDocs = docsFromProperty(properties, ['직접서류', '직접 서류', '추가서류', '추가 서류', 'selfDocs'], '직접 준비', 'self');
  const notes = notesFromProperty(properties, ['주의사항', '안내문구', '안내 문구', 'notes']);

  return {
    claimType,
    title: propertyText(firstProperty(properties, ['이름', 'Name', '제목', 'title'])) || fallback.title,
    source: 'notion',
    hospitalDocs: hospitalDocs.length ? hospitalDocs : fallback.hospitalDocs,
    selfDocs: selfDocs.length ? selfDocs : fallback.selfDocs,
    notes: notes.length ? notes : fallback.notes,
  };
};

const notionQuery = async (databaseId: string) => {
  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionToken()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ page_size: 100 }),
  });
  const data = (await response.json().catch(() => ({}))) as NotionQueryResponse;

  if (!response.ok) {
    throw new Error(data.message || 'Notion API request failed');
  }

  return data.results || [];
};

const getClaimDocuments = async (claimType: ClaimType, insurer = '') => {
  const fallback = FALLBACK_GUIDES[claimType] || FALLBACK_GUIDES.manual;
  const databaseId = notionDatabaseId();

  if (!notionToken() || !databaseId) {
    return { ...fallback, warning: 'NOTION 토큰 또는 NOTION_DATABASE_ID가 없어 기본 안내를 표시합니다.' };
  }

  try {
    const pages = await notionQuery(databaseId);
    const page = pages
      .filter((item) => isActivePage(item) && matchesClaimType(item, claimType))
      .sort((a, b) => insurerScore(b, insurer) - insurerScore(a, insurer))
      .find((item) => insurerScore(item, insurer) > 0);
    if (!page) {
      return { ...fallback, warning: 'Notion DB에서 해당 청구 유형을 찾지 못해 기본 안내를 표시합니다.' };
    }
    return pageToGuide(page, claimType);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...fallback,
      warning: message.includes('Could not find database')
        ? 'Notion DB를 찾지 못했습니다. DB ID와 integration 공유 권한을 확인하세요.'
        : `Notion 조회 실패: ${message}`,
    };
  }
};

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

export function loadLocalEnv() {
  loadEnvFile(path.join(workspaceRoot, '.env'));
  loadEnvFile(path.join(projectRoot, '.env'));
}

export async function handleClaimDocuments(req: IncomingMessage, res: ServerResponse) {
  if (!req.url) {
    sendJson(res, 400, { error: 'Missing URL' });
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const rawClaimType = url.searchParams.get('claimType') || 'manual';
  const insurer = url.searchParams.get('insurer') || '';
  const claimType = (rawClaimType in FALLBACK_GUIDES ? rawClaimType : 'manual') as ClaimType;
  const guide = await getClaimDocuments(claimType, insurer);
  sendJson(res, 200, guide);
}
