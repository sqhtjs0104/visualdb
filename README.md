# visualdb prototype

간단한 R3F 기반 씬에서 스키마 DTO를 입력하고 mock 데이터를 시각화할 수 있는 베이스 코드입니다.

## 구성
- **Schema 입력창**: JSON DTO 붙여넣기/수정 후 `Apply schema JSON` 버튼으로 씬과 패널을 갱신합니다.
- **Mock 데이터**: `src/mockData.ts`에 기본 ecommerce 스키마가 포함되어 있으며 자유롭게 수정 가능합니다.
- **3D 씬**: React Three Fiber를 이용해 테이블 박스와 FK 라인을 렌더링합니다. 레이아웃 좌표는 `positions[tableName]`으로 지정하거나 자동 그리드로 배치됩니다.
- **Model 패널**: 선택한 테이블의 칼럼/PK/관계 정보를 표시합니다.

## 실행
```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 열어 인터랙션을 확인합니다.
