// 수면일지 JS
// - localStorage에 자동 저장
// - 비어 있을 경우 /data/sleep-log-initial.json에서 초기 데이터 로드

(() => {
  const STORAGE_KEY = "sleepLogSegments_v1";

  // segments: { date, kind, start, end } 배열
  let segments = [];

  // 정오 기준 24시간: 12시 ~ 23시, 24시, 1시 ~ 11시
  const SLOT_LABELS = [
    "12시", "13시", "14시", "15시", "16시", "17시", "18시", "19시",
    "20시", "21시", "22시", "23시", "24시",
    "1시", "2시", "3시", "4시", "5시", "6시", "7시", "8시", "9시", "10시", "11시"
  ];

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const headerRow = document.getElementById("sleep-header-row");
    const tbody = document.getElementById("sleep-body");

    const addBtn = document.getElementById("add-btn");
    const clearAllBtn = document.getElementById("clear-all-btn");
    const dumpJsonBtn = document.getElementById("dump-json-btn");
    const jsonDumpArea = document.getElementById("json-dump");

    // 헤더에 시간 슬롯 생성
    SLOT_LABELS.forEach(label => {
      const th = document.createElement("th");
      th.textContent = label;
      headerRow.appendChild(th);
    });

    // 저장된 데이터 로드 (localStorage → 없으면 data 파일)
    await loadFromStorage();
    renderAll();

    // ===== 이벤트 바인딩 =====
    addBtn.addEventListener("click", () => {
      const dateStr = document.getElementById("date-input").value;
      const startTime = document.getElementById("start-time").value;
      const endTime = document.getElementById("end-time").value;
      const typeInput = document.querySelector('input[name="segment-type"]:checked');
      const type = typeInput ? typeInput.value : null;

      if (!dateStr) {
        alert("기준 날짜를 입력해 주세요.");
        return;
      }
      if (!startTime) {
        alert("시작 시간을 입력해 주세요.");
        return;
      }
      if (!type) {
        alert("기록 종류를 선택해 주세요.");
        return;
      }

      const segment = {
        date: dateStr,
        kind: type,
        start: startTime,
        end: type === "med" ? null : (endTime || null),
      };

      if (segment.kind !== "med" && !segment.end) {
        alert("끝 시간을 입력해 주세요. (약 복용만 끝 시간 생략 가능)");
        return;
      }

      segments.push(segment);
      saveToStorage();
      renderSegment(segment);
    });

    clearAllBtn.addEventListener("click", () => {
      if (!confirm("수면일지 전체 데이터를 삭제할까요?\n(이 컴퓨터/브라우저에 저장된 기록이 모두 지워집니다.)")) {
        return;
      }
      segments = [];
      saveToStorage();
      tbody.innerHTML = "";
      jsonDumpArea.style.display = "none";
      jsonDumpArea.value = "";
    });

    dumpJsonBtn.addEventListener("click", () => {
      if (jsonDumpArea.style.display === "none") {
        jsonDumpArea.style.display = "block";
        jsonDumpArea.value = JSON.stringify(segments, null, 2);
      } else {
        jsonDumpArea.style.display = "none";
      }
    });

    // ===== 내부 함수들 =====

    function formatDateLabel(dateStr) {
      if (!dateStr) return "";
      const parts = dateStr.split("-");
      if (parts.length !== 3) return dateStr;
      return parts[0] + "." + parts[1] + "." + parts[2] + ".";
    }

    // 24시간을 "정오 기준" 인덱스로 변환
    // 12:00 → 0, 13:00 → 1, ..., 23:00 → 11, 00:00 → 12, 01:00 → 13, ..., 11:00 → 23
    function timeToSlotIndex(timeStr) {
      if (!timeStr) return null;
      const [hStr, mStr] = timeStr.split(":");
      let h = parseInt(hStr, 10);
      let m = parseInt(mStr || "0", 10);

      if (isNaN(h) || isNaN(m)) return null;

      const t = h + m / 60;
      let offset = t - 12;
      if (offset < 0) offset += 24;
      const index = Math.floor(offset);
      return index;
    }

    function getOrCreateRow(dateStr) {
      let row = tbody.querySelector('tr[data-date="' + dateStr + '"]');
      if (row) return row;

      row = document.createElement("tr");
      row.dataset.date = dateStr;

      const dateCell = document.createElement("td");
      dateCell.textContent = formatDateLabel(dateStr);
      dateCell.classList.add("date-col");
      row.appendChild(dateCell);

      for (let i = 0; i < 24; i++) {
        const td = document.createElement("td");
        td.classList.add("sleep-cell");
        td.dataset.slotIndex = String(i);
        row.appendChild(td);
      }

      tbody.appendChild(row);
      return row;
    }

    function applyTypeToCell(cell, type) {
      cell.classList.remove("sleep-night", "sleep-awake", "sleep-nap");
      if (type === "night") cell.classList.add("sleep-night");
      if (type === "awake") cell.classList.add("sleep-awake");
      if (type === "nap") cell.classList.add("sleep-nap");
    }

    function addPillDot(cell) {
      if (cell.querySelector(".pill-dot")) return;
      const dot = document.createElement("span");
      dot.className = "pill-dot";
      cell.appendChild(dot);
    }

    function fillRange(row, startTime, endTime, type) {
      const startIndex = timeToSlotIndex(startTime);
      const endIndexRaw = timeToSlotIndex(endTime);

      if (startIndex === null || endIndexRaw === null) return;

      let start = startIndex;
      let end = endIndexRaw;

      if (end <= start) {
        end += 24;
      }

      for (let i = start; i < end; i++) {
        if (i < 0 || i >= 24) continue;
        const slot = i;
        const cell = row.querySelector('td[data-slot-index="' + slot + '"]');
        if (!cell) continue;
        applyTypeToCell(cell, type);
      }
    }

    function renderSegment(segment) {
      const row = getOrCreateRow(segment.date);

      if (segment.kind === "med") {
        const slotIndex = timeToSlotIndex(segment.start);
        if (slotIndex === null) return;
        const cell = row.querySelector('td[data-slot-index="' + slotIndex + '"]');
        if (cell) addPillDot(cell);
        return;
      }

      if (!segment.start || !segment.end) return;
      fillRange(row, segment.start, segment.end, segment.kind);
    }

    function renderAll() {
      tbody.innerHTML = "";
      segments.forEach(seg => renderSegment(seg));
    }

    function saveToStorage() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(segments));
      } catch (e) {
        console.error("수면일지 저장 실패:", e);
      }
    }

    async function loadFromStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            segments = parsed;
            return;
          }
        }

        // localStorage 비어 있으면 data 파일에서 초기 데이터 로드
        try {
          const res = await fetch("/data/sleep-log-initial.json", { cache: "no-cache" });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
              segments = data;
              saveToStorage(); // 한 번 localStorage에도 복사
              return;
            }
          }
        } catch (e) {
          console.warn("초기 수면일지 데이터 로드 실패(무시 가능):", e);
        }

        segments = [];
      } catch (e) {
        console.error("수면일지 로드 실패:", e);
        segments = [];
      }
    }
  }
})();
