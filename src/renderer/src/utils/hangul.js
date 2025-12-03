// 한글 자모 및 키 매핑 데이터 (영문 키보드 -> 한글 자모)
const ENG_KEY = "rRseEfaqQtTdwWczxvgkoiOjpuPhynbml";
// 수정: 표준 두벌식 자판에 존재하지 않는 복합 모음(ㅘ, ㅙ, ㅚ, ㅝ, ㅞ, ㅟ, ㅢ) 제거하여 인덱스 매핑 수정
const KOR_KEY = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅛㅜㅠㅡㅣ";

// 초성, 중성, 종성 인덱스 데이터
const CHO_DATA = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
// 중성 데이터는 유니코드 순서를 따름 (복합 모음 포함)
const JUNG_DATA = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
// 종성은 0번 인덱스가 '없음'이므로 실제 데이터는 1번부터 매핑됨
const JONG_DATA = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"; 

const KOR_START = 0xAC00;
const CHO_BASE = 588;
const JUNG_BASE = 28;

// 복합 모음 매핑 (기존 중성 + 입력 모음 -> 새 중성)
const COMPLEX_VOWELS = {
    'ㅗ': { 'ㅏ': 'ㅘ', 'ㅐ': 'ㅙ', 'ㅣ': 'ㅚ' },
    'ㅜ': { 'ㅓ': 'ㅝ', 'ㅔ': 'ㅞ', 'ㅣ': 'ㅟ' },
    'ㅡ': { 'ㅣ': 'ㅢ' }
};

// 복합 받침 매핑 (기존 종성 + 입력 자음 -> 새 종성)
const COMPLEX_JONGS = {
    'ㄱ': { 'ㅅ': 'ㄳ' },
    'ㄴ': { 'ㅈ': 'ㄵ', 'ㅎ': 'ㄶ' },
    'ㄹ': { 'ㄱ': 'ㄺ', 'ㅁ': 'ㄻ', 'ㅂ': 'ㄼ', 'ㅅ': 'ㄽ', 'ㅌ': 'ㄾ', 'ㅍ': 'ㄿ', 'ㅎ': 'ㅀ' },
    'ㅂ': { 'ㅅ': 'ㅄ' }
};

// 복합 받침 분해 (종성이 있는 상태에서 모음이 올 경우 분리)
const DECOMPOSE_JONG = {
    'ㄳ': ['ㄱ','ㅅ'], 'ㄵ': ['ㄴ','ㅈ'], 'ㄶ': ['ㄴ','ㅎ'],
    'ㄺ': ['ㄹ','ㄱ'], 'ㄻ': ['ㄹ','ㅁ'], 'ㄼ': ['ㄹ','ㅂ'],
    'ㄽ': ['ㄹ','ㅅ'], 'ㄾ': ['ㄹ','ㅌ'], 'ㄿ': ['ㄹ','ㅍ'], 'ㅀ': ['ㄹ','ㅎ'],
    'ㅄ': ['ㅂ','ㅅ']
};

export function engToKor(text) {
    let res = "";
    // 현재 조합 중인 글자의 상태 (-1은 해당 위치가 비어있음을 의미)
    let cho = -1, jung = -1, jong = -1;

    // 조합 중인 글자를 완성 문자열에 추가하고 버퍼 초기화
    const commit = () => {
        if (cho !== -1) {
            if (jung !== -1) {
                // 초+중+(종) 완성형 문자 생성
                // 종성 인덱스는 JONG_DATA에서의 인덱스 + 1 (0은 받침 없음)
                const jongIdx = jong !== -1 ? jong + 1 : 0;
                res += String.fromCharCode(KOR_START + (cho * CHO_BASE) + (jung * JUNG_BASE) + jongIdx);
            } else {
                // 초성만 있는 경우 (자음 단독)
                res += CHO_DATA[cho];
            }
        } else if (jung !== -1) {
            // 중성만 있는 경우 (모음 단독)
            res += JUNG_DATA[jung];
        } else if (jong !== -1) {
             // 종성만 있는 경우 (일반적으로 발생 안 함)
             res += JONG_DATA[jong]; 
        }
        cho = -1; jung = -1; jong = -1;
    };

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const idx = ENG_KEY.indexOf(char);
        
        // 1. 영문 자판에 없는 문자면(공백, 숫자 등) 커밋하고 그대로 출력
        if (idx === -1) {
            commit();
            res += char;
            continue;
        }

        const korChar = KOR_KEY[idx];
        const isVowel = JUNG_DATA.indexOf(korChar) !== -1;
        
        if (!isVowel) {
            // ==================== [자음 입력] ====================
            if (cho === -1) {
                // 초성 없음 -> 초성으로 설정
                if (jung !== -1) commit(); // 기존 모음이 있으면 완료 처리
                cho = CHO_DATA.indexOf(korChar);
            } else if (jung === -1) {
                // 초성 있음, 중성 없음 -> 앞 글자 완료 후 새 초성 (예: ㄱㄴ)
                commit();
                cho = CHO_DATA.indexOf(korChar);
            } else if (jong === -1) {
                // 초+중 있음, 종성 없음 -> 종성으로 설정
                const jongIdx = JONG_DATA.indexOf(korChar);
                if (jongIdx !== -1) {
                    jong = jongIdx; // JONG_DATA의 인덱스 저장
                } else {
                    // 종성으로 올 수 없는 자음(ㄸ,ㅃ,ㅉ)이면 앞 글자 완료
                    commit();
                    cho = CHO_DATA.indexOf(korChar);
                }
            } else {
                // 종성 있음 -> 복합 받침 확인 (예: 닭)
                const curJongChar = JONG_DATA[jong];
                if (COMPLEX_JONGS[curJongChar] && COMPLEX_JONGS[curJongChar][korChar]) {
                    const newJongChar = COMPLEX_JONGS[curJongChar][korChar];
                    jong = JONG_DATA.indexOf(newJongChar);
                } else {
                    // 복합 받침 불가하면 앞 글자 완료
                    commit();
                    cho = CHO_DATA.indexOf(korChar);
                }
            }
        } else {
            // ==================== [모음 입력] ====================
            if (cho === -1) {
                // 초성 없음 (모음 단독)
                if (jung !== -1) {
                    // 기존 모음과 합쳐지는지 확인 (예: ㅡ + ㅣ = ㅢ)
                    const curJungChar = JUNG_DATA[jung];
                    if (COMPLEX_VOWELS[curJungChar] && COMPLEX_VOWELS[curJungChar][korChar]) {
                        jung = JUNG_DATA.indexOf(COMPLEX_VOWELS[curJungChar][korChar]);
                    } else {
                        commit();
                        jung = JUNG_DATA.indexOf(korChar);
                    }
                } else {
                    jung = JUNG_DATA.indexOf(korChar);
                }
            } else if (jung === -1) {
                // 초성 있음 -> 중성으로 설정
                jung = JUNG_DATA.indexOf(korChar);
            } else if (jong === -1) {
                // 초+중 있음 -> 복합 모음 확인 (예: 고 + ㅏ = 과)
                const curJungChar = JUNG_DATA[jung];
                if (COMPLEX_VOWELS[curJungChar] && COMPLEX_VOWELS[curJungChar][korChar]) {
                    jung = JUNG_DATA.indexOf(COMPLEX_VOWELS[curJungChar][korChar]);
                } else {
                    // 복합 모음 아니면 앞 글자 완료 (예: 가 + ㅏ = 가아)
                    commit();
                    jung = JUNG_DATA.indexOf(korChar); // 모음 단독 시작
                }
            } else {
                // ★ [핵심] 종성 있음 -> 연음 법칙 (종성을 다음 글자 초성으로 이동)
                // 예: whxhl -> 좉(x) + ㅣ(l) -> 조 + 퇴
                
                const jongChar = JONG_DATA[jong];
                let prevJong = -1;
                let nextChoChar = "";
                
                // 복합 받침 분해 (예: 닭 + ㅏ -> 달가)
                if (DECOMPOSE_JONG[jongChar]) {
                    const parts = DECOMPOSE_JONG[jongChar];
                    // 앞 받침 남김
                    prevJong = JONG_DATA.indexOf(parts[0]);
                    // 뒤 받침은 다음 글자 초성으로
                    nextChoChar = parts[1];
                } else {
                    // 홑받침이면 받침 제거하고 다음 초성으로 이동
                    prevJong = -1;
                    nextChoChar = jongChar;
                }
                
                // 1. 현재 글자(앞 글자) 확정 (받침을 덜어내고)
                const savedCho = cho;
                const savedJung = jung;
                
                // 임시로 상태 변경하여 commit
                cho = savedCho; 
                jung = savedJung; 
                jong = prevJong;
                commit(); 
                
                // 2. 다음 글자 상태 설정 (넘어온 자음 + 입력된 모음)
                cho = CHO_DATA.indexOf(nextChoChar);
                jung = JUNG_DATA.indexOf(korChar);
                
                // ★ [추가] 모음 결합 처리 (연음 후 복합 모음 확인)
                // 예: d(ㅇ) + h(ㅗ) + l(ㅣ) -> dhl
                // 1. d+h -> 오
                // 2. +l -> 오에서 종성 없음 -> [3. 초+중 있음 -> 복합 모음 확인] 로직으로 처리됨.
                // 하지만 '좉' + 'l' 처럼 종성이 있는 상태에서 모음이 오면 여기로 옴.
                // 종성 'ㅌ'이 다음 초성으로 가고 'ㅣ'와 결합 -> '티'.
                // 여기서 'ㅣ'가 만약 복합 모음의 일부라면? (예: ㅚ의 일부).
                // 이미 'jung'은 'ㅣ'로 설정됨.
                // 만약 연음된 후 바로 복합 모음이 형성되는 경우는 없음 (자음 + 모음 이므로).
                // 'dhl'의 경우 'dh'에서 'jong'이 없으므로 위쪽 `else if (jong === -1)` 분기에서 처리되어 '외'가 됨.
            }
        }
    }
    commit(); // 루프 종료 후 남은 글자 처리
    return res;
}