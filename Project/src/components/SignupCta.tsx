import { useState } from 'react';
import { useMvp } from '../mvp/MvpContext';

const INSURER_OPTIONS = [
  '메리츠화재 펫퍼민트',
  'DB손해보험 펫블리',
  'KB손해보험 금쪽같은 펫보험',
  '삼성화재 위풍당당',
  '현대해상 굿앤굿우리펫',
  '한화손해보험 펫투게더',
  '롯데손해보험 마이펫보험',
  'NH농협손해보험 펫앤미든든',
  '기타 / 모름',
];

export default function SignupCta() {
  const { open } = useMvp();
  const [submitted, setSubmitted] = useState(false);
  const [insurer, setInsurer] = useState('');

  return (
    <section id="signup" style={{ paddingBottom: 90 }}>
      <div className="wrap">
        <div className="mvp-strip">
          <span className="line">결과가 어떻게 나오는지, 먼저 체험해볼까요?</span>
          <button className="btn btn-sage" onClick={open}>체험해보기 🐾</button>
        </div>
        <div className="signup-box">
          <h2>가장 먼저 써보실래요?</h2>
          <p className="sub">출시되면 제일 먼저 알려드릴게요. 이메일과 가입 보험사만 남겨주시면 준비 끝!</p>
          <form className="signup-form" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
            <div className="field-row">
              <input className="field" type="email" placeholder="이메일 주소" required disabled={submitted} />
              <select
                className="field"
                value={insurer}
                onChange={(e) => setInsurer(e.target.value)}
                style={{ color: insurer ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
                disabled={submitted}
              >
                <option value="">가입 보험사 (선택)</option>
                {INSURER_OPTIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            <button
              className="signup-submit"
              type="submit"
              disabled={submitted}
              style={submitted ? { background: 'var(--success-500)' } : undefined}
            >
              {submitted ? '신청 완료! 가장 먼저 알려드릴게요 🐾' : '출시 알림 신청하기 🐾'}
            </button>
          </form>
          <p className="privacy">🔒 입력하신 정보는 출시 알림 용도로만 사용하고 안전하게 보관해요 · 개인정보 처리방침</p>
        </div>
      </div>
    </section>
  );
}
