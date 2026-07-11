import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useMvp } from './MvpContext';
import { EXAMPLES } from '../data/examples';
import { DEFAULT_INSURER } from '../data/insurers';
import { extractFieldsFromImage } from '../lib/ocrFields';
import { receiptSVG } from '../lib/receiptSVG';
import { EMPTY_FIELDS, type Fields, type UploadInfo } from './types';
import Step1Upload from './Step1Upload';
import Step2Insurer from './Step2Insurer';
import Step3Result from './Step3Result';

const STEP_LABELS = ['올리기', '보험 선택', '필요 서류'];

export default function MvpModal() {
  const { isOpen, close } = useMvp();

  const [step, setStep] = useState(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [ready, setReady] = useState(false);
  const [selectedExample, setSelectedExample] = useState<number | null>(null);
  const [upload, setUpload] = useState<UploadInfo | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [surgery, setSurgery] = useState(false);
  const [insurer, setInsurer] = useState(DEFAULT_INSURER);

  const timer = useRef<number | null>(null);
  const clearTimer = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const resetStep1 = useCallback(() => {
    clearTimer();
    setAnalyzing(false);
    setReady(false);
    setSelectedExample(null);
    setUpload(null);
    setFields(EMPTY_FIELDS);
    setSurgery(false);
  }, []);

  /* Reset whole flow whenever the modal opens; lock body scroll + ESC to close. */
  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setInsurer(DEFAULT_INSURER);
    resetStep1();
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      clearTimer();
    };
  }, [isOpen, close, resetStep1]);

  function startAnalysis(info: Omit<UploadInfo, 'status'>, isExample: boolean, fill: Fields, fillSurgery: boolean) {
    clearTimer();
    setUpload({ ...info, status: '영수증을 분석 중이에요…' });
    setAnalyzing(true);
    setReady(false);
    timer.current = window.setTimeout(() => {
      setFields(fill);
      setSurgery(fillSurgery);
      setAnalyzing(false);
      setReady(true);
      setUpload((u) => (u ? { ...u, status: isExample ? '예시 이미지 · 분석 완료' : '분석 완료' } : u));
    }, 1400);
  }

  function selectExample(i: number) {
    const ex = EXAMPLES[i];
    setSelectedExample(i);
    const url = receiptSVG(ex);
    startAnalysis(
      { name: ex.file, url, downloadName: ex.file.replace(/\.jpg$/, '.svg') },
      true,
      { docType: ex.docType, date: ex.date, diag: ex.diag, cost: ex.cost },
      ex.surgery,
    );
  }

  function uploadFile(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const url = reader.result as string;
      setSelectedExample(null);
      clearTimer();
      setUpload({ name: file.name, url, downloadName: file.name, status: 'OCR로 영수증을 읽고 있어요…' });
      setAnalyzing(true);
      setReady(false);

      try {
        const result = await extractFieldsFromImage(file);
        setFields({
          docType: result.fields.docType || '진료비 영수증',
          date: result.fields.date,
          diag: result.fields.diag,
          cost: result.fields.cost,
        });
        setSurgery(result.surgery);
        setUpload((u) => (u ? { ...u, status: 'OCR 분석 완료 · 필요한 값은 직접 수정할 수 있어요' } : u));
      } catch {
        setFields({ docType: '진료비 영수증', date: '', diag: '', cost: '' });
        setSurgery(false);
        setUpload((u) => (u ? { ...u, status: 'OCR 실패 · 직접 입력해 주세요' } : u));
      } finally {
        setAnalyzing(false);
        setReady(true);
      }
    };
    reader.readAsDataURL(file);
  }

  if (!isOpen) return null;

  const canNext = ready && !analyzing;

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="보험찾개냥 체험하기">
        <div className="modal-head">
          <div className="modal-brand">
            <span className="paw">🐾</span>
            <span className="nm">보험찾개냥 체험하기</span>
            <span className="beta-badge">BETA</span>
          </div>
          <button className="modal-close" onClick={close} aria-label="닫기">✕</button>
        </div>

        <div className="stepper">
          {STEP_LABELS.map((label, idx) => {
            const n = idx + 1;
            const cls = n === step ? 'active' : n < step ? 'done' : '';
            return (
              <Fragment key={n}>
                {idx > 0 && <div className="step-line" />}
                <div className={`step-node ${cls}`.trim()}>
                  <span className="step-dot">{n < step ? '✓' : n}</span>
                  <span className="step-label">{label}</span>
                </div>
              </Fragment>
            );
          })}
        </div>

        <div className="modal-body" key={step}>
          {step === 1 && (
            <Step1Upload
              selectedExample={selectedExample}
              analyzing={analyzing}
              ready={ready}
              upload={upload}
              fields={fields}
              surgery={surgery}
              onSelectExample={selectExample}
              onUploadFile={uploadFile}
              onRemove={resetStep1}
              onFieldChange={(key, value) => setFields((f) => ({ ...f, [key]: value }))}
              onToggleSurgery={() => setSurgery((s) => !s)}
            />
          )}
          {step === 2 && <Step2Insurer selected={insurer} onSelect={setInsurer} />}
          {step === 3 && <Step3Result insurerLabel={insurer} fields={fields} surgery={surgery} />}
        </div>

        <div className={`modal-foot step-${step}`}>
          <span className="step-count">{step} / 3 단계</span>
          <div className="foot-btns">
            {step > 1 && (
              <button className="mbtn ghost" onClick={() => setStep((s) => Math.max(1, s - 1))}>← 이전</button>
            )}
            {step === 1 && (
              <button
                className="mbtn primary"
                disabled={!canNext}
                title={analyzing ? '분석 중이에요' : !ready ? '먼저 영수증을 올리거나 예시를 선택해 주세요' : undefined}
                onClick={() => canNext && setStep(2)}
              >
                다음 →
              </button>
            )}
            {step === 2 && (
              <button className="mbtn primary" onClick={() => setStep(3)}>필요 서류 확인하기 →</button>
            )}
            {step === 3 && (
              <button
                className="mbtn primary"
                onClick={() => {
                  close();
                  document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                출시 알림 받고 먼저 써보기 🐾
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
