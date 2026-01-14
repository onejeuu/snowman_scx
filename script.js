document.addEventListener("DOMContentLoaded", function () {
  const rows = 5;
  const cols = 6;
  let gameBoard = [];
  let emptyCells = [];
  let possibleGoldCells = [];
  let outlineMode = false;
  let nextMoveMode = false;
  let nextMoveHintCell = null;

  // Алмазная формация - оптимальный старт
  const DIAMOND_FORMATION = [
    { row: 1, col: 1 }, // (2,2)
    { row: 1, col: 4 }, // (2,5)
    { row: 3, col: 1 }, // (4,2)
    { row: 3, col: 4 }, // (4,5)
  ];

  const gameBoardElement = document.getElementById("game-board");
  const goldCountElement = document.getElementById("gold-count");
  const emptyCountElement = document.getElementById("empty-count");
  const possibleGoldCountElement = document.getElementById("possible-gold-count");
  const nextMoveCellElement = document.getElementById("next-move-cell");
  const newGameBtn = document.getElementById("new-game-btn");
  const outlineModeBtn = document.getElementById("outline-mode-btn");
  const nextMoveBtn = document.getElementById("next-move-btn");
  const exportBtn = document.getElementById("export-btn");
  const exportImportModal = document.getElementById("export-import-modal");
  const exportImportOverlay = document.getElementById("export-import-overlay");
  const exportCodeElement = document.getElementById("export-code");
  const copyBtn = document.getElementById("copy-btn");
  const importInput = document.getElementById("import-input");
  const loadBtn = document.getElementById("load-btn");
  const importStatus = document.getElementById("import-status");
  const closeExportModal = document.getElementById("close-export-modal");

  // Элементы модального окна
  const modalOverlay = document.getElementById("modal-overlay");
  const modalTitle = document.getElementById("modal-title-text");
  const modalRank = document.getElementById("modal-rank");
  const modalContent = document.getElementById("modal-content");
  const closeModalBtn = document.getElementById("close-modal");

  // Состояния клеток
  const CELL_STATES = {
    UNKNOWN: "unknown",
    NORMAL: "normal",
    GOLD: "gold",
    EMPTY: "empty",
    POSSIBLE_GOLD: "possible-gold",
  };

  // Коды для экспорта
  const CELL_CODES = {
    unknown: "u",
    normal: "n",
    gold: "g",
    empty: "e",
    outline: "o",
  };

  const CODE_CELLS = {
    u: CELL_STATES.UNKNOWN,
    n: CELL_STATES.NORMAL,
    g: CELL_STATES.GOLD,
    e: CELL_STATES.EMPTY,
    o: CELL_STATES.UNKNOWN,
  };

  // Инициализация игрового поля
  function initGameBoard() {
    // 1. Быстрый сброс состояния
    gameBoard = [];
    emptyCells = [];
    possibleGoldCells = [];
    outlineMode = false;
    nextMoveMode = false;
    nextMoveHintCell = null;

    // 2. Создаем массив быстро
    for (let row = 0; row < rows; row++) {
      gameBoard[row] = new Array(cols);
      for (let col = 0; col < cols; col++) {
        gameBoard[row][col] = {
          state: CELL_STATES.UNKNOWN,
          hasGoldOutline: false,
          goldChance: 0,
          row: row,
          col: col,
          isRecommended: false,
          infoValue: 0,
        };
      }
    }

    // 3. МИНИМАЛЬНЫЙ рендеринг (без анализа процентов)
    renderGameBoardFast();

    // 4. Тяжелые вычисления - после
    requestIdleCallback(
      () => {
        analyzeBoard();
        updateCounters();
        if (nextMoveMode) updateNextMoveHint();
        // Полный рендеринг с процентами
        renderGameBoardFull();
      },
      { timeout: 500 }
    );

    // Инициализируем предпросмотры тактик
    initTacticPreviews();

    // Настраиваем обработчики создания предпросмотров
    setupTacticCards();
  }

  function renderGameBoardFast() {
    // Быстрый рендеринг без сложных вычислений
    const fragment = document.createDocumentFragment();

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gameBoard[row][col];
        const cellElement = document.createElement("div");

        // Только базовые классы
        let cellClass = `cell ${cell.state}`;
        if (cell.hasGoldOutline) cellClass += " gold-outline";
        if (nextMoveMode && cell.isRecommended) cellClass += " next-move-hint";

        cellElement.className = cellClass;
        cellElement.textContent = cell.state === CELL_STATES.GOLD ? "★" : "";

        // Координаты
        const cellNumber = document.createElement("div");
        cellNumber.className = "cell-number";
        cellNumber.textContent = `${row + 1},${col + 1}`;
        cellElement.appendChild(cellNumber);

        // НЕТ процентов на этом этапе!

        cellElement.addEventListener("click", () => handleCellClick(row, col));
        fragment.appendChild(cellElement);
      }
    }

    gameBoardElement.innerHTML = "";
    gameBoardElement.appendChild(fragment);
  }

  function renderGameBoardFull() {
    // Полный рендеринг с процентами (вызывается позже)
    const cells = gameBoardElement.children;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gameBoard[row][col];
        const cellElement = cells[row * cols + col];

        // Добавляем проценты если нужно
        if (cell.goldChance > 0 && cell.state === CELL_STATES.UNKNOWN) {
          // Удаляем старые проценты
          const oldChance = cellElement.querySelector(".gold-chance");
          if (oldChance) oldChance.remove();

          // Добавляем новые
          const chanceElement = document.createElement("div");
          chanceElement.className = "gold-chance";
          chanceElement.classList.add(cell.goldChance >= 50 ? "high" : "low");
          chanceElement.textContent = `${Math.round(cell.goldChance)}%`;
          cellElement.appendChild(chanceElement);
        } else {
          // Убираем проценты если не нужны
          const oldChance = cellElement.querySelector(".gold-chance");
          if (oldChance) oldChance.remove();
        }
      }
    }
  }

  // УЛУЧШЕННАЯ ФУНКЦИЯ ПОДСКАЗКИ С РАЦИОНАЛЬНОЙ ЛОГИКОЙ
  function calculateNextMove() {
    let bestCell = null;
    let bestScore = -Infinity;

    // ОПТИМИЗАЦИЯ: Получаем общие данные один раз
    const totalCells = rows * cols;
    const unknownCount = countUnknownCells();
    const unknownPercentage = (unknownCount / totalCells) * 100;

    // Определяем, стоит ли использовать бонус за алмазную формацию
    const useDiamondBonus = shouldContinueFormation(DIAMOND_FORMATION);

    // Сбрасываем все флаги
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        gameBoard[row][col].isRecommended = false;
        gameBoard[row][col].infoValue = 0;
      }
    }

    // ------------------------------------------------------------
    // ПРИОРИТЕТ 1: ГАРАНТИРОВАННОЕ ЗОЛОТО (100% шанс)
    // ------------------------------------------------------------
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gameBoard[row][col];
        if (cell.state !== CELL_STATES.UNKNOWN) continue;
        if (emptyCells.some((ec) => ec.row === row && ec.col === col)) continue;

        // Клетки с 95-100% шансом (триангуляция или принудительное золото)
        if (cell.goldChance >= 95) {
          // Максимальный приоритет - сразу возвращаем
          return { row, col, score: 1000 };
        }
      }
    }

    // ------------------------------------------------------------
    // ПРИОРИТЕТ 2: ОЧЕНЬ ВЫСОКИЙ ШАНС (>80%)
    // ------------------------------------------------------------
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gameBoard[row][col];
        if (cell.state !== CELL_STATES.UNKNOWN) continue;
        if (emptyCells.some((ec) => ec.row === row && ec.col === col)) continue;

        if (cell.goldChance >= 80) {
          const score = 500 + cell.goldChance; // 580-599
          if (score > bestScore) {
            bestScore = score;
            bestCell = { row, col, score };
          }
        }
      }
    }

    if (bestCell) return bestCell;

    // ------------------------------------------------------------
    // ПРИОРИТЕТ 3: ПРИНУДИТЕЛЬНОЕ ЗОЛОТО (логический вывод)
    // ------------------------------------------------------------
    // Проверяем все контуры - если у контура остался только один неизвестный сосед
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (gameBoard[row][col].hasGoldOutline) {
          const neighbors = getAdjacentCells(row, col);

          let goldCount = 0;
          let unknownNeighbors = [];

          neighbors.forEach((neighbor) => {
            const cell = gameBoard[neighbor.row][neighbor.col];
            if (cell.state === CELL_STATES.GOLD) {
              goldCount++;
            } else if (
              cell.state === CELL_STATES.UNKNOWN &&
              !emptyCells.some((ec) => ec.row === neighbor.row && ec.col === neighbor.col)
            ) {
              unknownNeighbors.push(neighbor);
            }
          });

          // Если у контура еще не найдено золото и остался только один неизвестный сосед
          if (goldCount === 0 && unknownNeighbors.length === 1) {
            const forcedGold = unknownNeighbors[0];
            // Приоритет чуть ниже 100% шанса, но выше обычных клеток
            const score = 450;
            if (score > bestScore) {
              bestScore = score;
              bestCell = { row: forcedGold.row, col: forcedGold.col, score };
            }
          }
        }
      }
    }

    if (bestCell) return bestCell;

    // ------------------------------------------------------------
    // ПРИОРИТЕТ 4: КЛЕТКИ МЕЖДУ ДВУМЯ КОНТУРАМИ (потенциальная триангуляция)
    // ------------------------------------------------------------
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gameBoard[row][col];
        if (cell.state !== CELL_STATES.UNKNOWN) continue;
        if (emptyCells.some((ec) => ec.row === row && ec.col === col)) continue;

        // Проверяем, сколько контуров вокруг
        const neighbors = getAdjacentCells(row, col);
        let outlineCount = 0;

        neighbors.forEach((neighbor) => {
          if (gameBoard[neighbor.row][neighbor.col].hasGoldOutline) {
            outlineCount++;
          }
        });

        if (outlineCount >= 2) {
          // Это клетка между контурами - высокая вероятность золота
          const score = 400 + calculateInformationValue(row, col, useDiamondBonus);
          if (score > bestScore) {
            bestScore = score;
            bestCell = { row, col, score };
          }
        }
      }
    }

    if (bestCell) return bestCell;

    // ------------------------------------------------------------
    // ПРИОРИТЕТ 5: НАЧАЛО ИГРЫ - АЛМАЗНАЯ ФОРМАЦИЯ
    // ------------------------------------------------------------
    if (unknownCount === totalCells) {
      // Самая первая игра - предлагаем первую клетку алмазной формации
      bestCell = { row: DIAMOND_FORMATION[0].row, col: DIAMOND_FORMATION[0].col, score: 100 };
      return bestCell;
    }

    // ------------------------------------------------------------
    // ПРИОРИТЕТ 6: ЗАВЕРШЕНИЕ АЛМАЗНОЙ ФОРМАЦИИ (если начали)
    // ------------------------------------------------------------
    let startedDiamondFormation = 0;
    for (const pos of DIAMOND_FORMATION) {
      const cell = gameBoard[pos.row][pos.col];
      if (cell.state !== CELL_STATES.UNKNOWN || cell.hasGoldOutline) {
        startedDiamondFormation++;
      }
    }

    // Продолжаем алмазную формацию ТОЛЬКО если уже начали её
    if (startedDiamondFormation > 0) {
      let unfinishedDiamondCells = [];
      for (const pos of DIAMOND_FORMATION) {
        const cell = gameBoard[pos.row][pos.col];
        if ((cell.state === CELL_STATES.UNKNOWN && !cell.hasGoldOutline) || cell.hasGoldOutline) {
          if (!emptyCells.some((ec) => ec.row === pos.row && ec.col === pos.col)) {
            unfinishedDiamondCells.push(pos);
          }
        }
      }

      // Выбираем лучшую клетку из незавершенных
      if (unfinishedDiamondCells.length > 0) {
        let bestDiamondCell = null;
        let bestDiamondScore = -Infinity;

        for (const pos of unfinishedDiamondCells) {
          const cell = gameBoard[pos.row][pos.col];
          if (cell.state === CELL_STATES.NORMAL || cell.state === CELL_STATES.GOLD) {
            continue; // Пропускаем, если уже обычная или золотая
          }

          const score = calculateInformationValue(pos.row, pos.col, useDiamondBonus);
          if (score > bestDiamondScore) {
            bestDiamondScore = score;
            bestDiamondCell = pos;
          }
        }

        if (bestDiamondCell && bestDiamondScore > 30) {
          const finalScore = 300 + bestDiamondScore;
          if (finalScore > bestScore) {
            bestScore = finalScore;
            bestCell = { row: bestDiamondCell.row, col: bestDiamondCell.col, score: finalScore };
          }
        }
      }
    }

    if (bestCell) return bestCell;

    // ------------------------------------------------------------
    // ПРИОРИТЕТ 7: КЛЕТКИ РЯДОМ С КОНТУРАМИ (у которых нет золота)
    // ------------------------------------------------------------
    const outlineCells = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (gameBoard[row][col].hasGoldOutline) {
          outlineCells.push({ row, col });
        }
      }
    }

    for (const outline of outlineCells) {
      const neighbors = getAdjacentCells(outline.row, outline.col);
      let unknownNeighbors = [];

      neighbors.forEach((neighbor) => {
        const cell = gameBoard[neighbor.row][neighbor.col];
        if (
          cell.state === CELL_STATES.UNKNOWN &&
          !emptyCells.some((ec) => ec.row === neighbor.row && ec.col === neighbor.col)
        ) {
          unknownNeighbors.push(neighbor);
        }
      });

      // Если у контура есть неоткрытые соседи
      if (unknownNeighbors.length > 0) {
        // Проверяем, сколько золота уже найдено у этого контура
        let goldCount = 0;
        neighbors.forEach((neighbor) => {
          if (gameBoard[neighbor.row][neighbor.col].state === CELL_STATES.GOLD) {
            goldCount++;
          }
        });

        // Если у контура уже есть золото, приоритет НИЗКИЙ
        if (goldCount > 0) {
          continue;
        }

        // Если золота нет, выбираем лучшего соседа
        let bestNeighbor = null;
        let bestNeighborScore = -Infinity;

        for (const neighbor of unknownNeighbors) {
          const score = calculateInformationValue(neighbor.row, neighbor.col, useDiamondBonus);
          if (score > bestNeighborScore) {
            bestNeighborScore = score;
            bestNeighbor = neighbor;
          }
        }

        if (bestNeighbor) {
          const finalScore = 200 + bestNeighborScore;
          if (finalScore > bestScore) {
            bestScore = finalScore;
            bestCell = { row: bestNeighbor.row, col: bestNeighbor.col, score: finalScore };
          }
        }
      }
    }

    if (bestCell) return bestCell;

    // ------------------------------------------------------------
    // ПРИОРИТЕТ 8: ПРИОРИТЕТ ЦЕНТРАЛЬНЫХ КЛЕТОК (если много неизвестных)
    // ------------------------------------------------------------
    if (unknownPercentage > 70) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = gameBoard[row][col];
          if (cell.state !== CELL_STATES.UNKNOWN) continue;
          if (emptyCells.some((ec) => ec.row === row && ec.col === col)) continue;

          // Особый бонус для центральных клеток при пустом поле
          if (row >= 1 && row <= 3 && col >= 1 && col <= 4) {
            const score = calculatePureInformationValue(row, col) + 100; // Бонус
            if (score > bestScore) {
              bestScore = score;
              bestCell = { row, col, score };
            }
          }
        }
      }

      if (bestCell) return bestCell;
    }

    // ------------------------------------------------------------
    // ПРИОРИТЕТ 9: САМАЯ ИНФОРМАТИВНАЯ КЛЕТКА (последний вариант)
    // ------------------------------------------------------------
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gameBoard[row][col];
        if (cell.state !== CELL_STATES.UNKNOWN) continue;
        if (emptyCells.some((ec) => ec.row === row && ec.col === col)) continue;

        const infoValue = calculateInformationValue(row, col, useDiamondBonus);
        const score = infoValue;

        if (score > bestScore) {
          bestScore = score;
          bestCell = { row, col, score };
        }
      }
    }

    return bestCell;
  }

  // Расчет информационной ценности клетки
  function calculateInformationValue(row, col, useDiamondBonus = false) {
    let infoValue = 0;
    const neighbors = getAdjacentCells(row, col);

    // 1. Считаем НОВУЮ информацию (неизвестные соседи)
    let newUnknownNeighbors = 0;
    neighbors.forEach((neighbor) => {
      const cell = gameBoard[neighbor.row][neighbor.col];
      // Только если клетка неизвестна И не помечена как пустая
      if (
        cell.state === CELL_STATES.UNKNOWN &&
        !emptyCells.some((ec) => ec.row === neighbor.row && ec.col === neighbor.col)
      ) {
        newUnknownNeighbors++;
      }
    });

    infoValue += newUnknownNeighbors * 25; // Больше очков за новую информацию

    // 2. Бонус за центральное положение
    const neighborCount = neighbors.length;
    if (neighborCount === 4) infoValue += 20;
    else if (neighborCount === 3) infoValue += 10;
    else if (neighborCount === 2) infoValue -= 15; // Больший штраф за углы

    // 3. Штраф за клетки рядом с уже найденным золотом
    let goldNeighbors = 0;
    neighbors.forEach((neighbor) => {
      if (gameBoard[neighbor.row][neighbor.col].state === CELL_STATES.GOLD) {
        goldNeighbors++;
      }
    });

    infoValue -= goldNeighbors * 30;

    // 4. Бонус за клетки рядом с контурами (у которых нет золота)
    let outlineNeighborCount = 0;
    neighbors.forEach((neighbor) => {
      if (gameBoard[neighbor.row][neighbor.col].hasGoldOutline) {
        const outlineAdjacentCells = getAdjacentCells(neighbor.row, neighbor.col);
        let hasGold = false;
        outlineAdjacentCells.forEach((n) => {
          if (gameBoard[n.row][n.col].state === CELL_STATES.GOLD) {
            hasGold = true;
          }
        });
        if (!hasGold) {
          outlineNeighborCount++;
        }
      }
    });

    infoValue += outlineNeighborCount * 12;

    // 5. ОСОБЫЙ БОНУС: если клетка даст информацию о ВЕРХНЕЙ ЧАСТИ поля
    // (верхние строки часто менее исследованы)
    if (row <= 1) {
      // Верхние 2 строки
      infoValue += 25;
    }

    // 6. ШТРАФ: если многие соседи уже известны как пустые
    let knownEmptyNeighbors = 0;
    neighbors.forEach((neighbor) => {
      if (emptyCells.some((ec) => ec.row === neighbor.row && ec.col === neighbor.col)) {
        knownEmptyNeighbors++;
      }
    });

    infoValue -= knownEmptyNeighbors * 20; // Штраф за "бесполезных" соседей

    // 7. Бонус за алмазную формацию
    if (useDiamondBonus) {
      for (const pos of DIAMOND_FORMATION) {
        if (pos.row === row && pos.col === col) {
          infoValue += 30;
          break;
        }
      }
    }

    return infoValue;
  }

  function calculatePureInformationValue(row, col) {
    const neighbors = getAdjacentCells(row, col);

    // 1. Количество соседей (основной фактор)
    let score = neighbors.length * 20; // 20 баллов за каждого соседа

    // 2. Положение на поле
    if (neighbors.length === 4) score += 30; // Центр - максимальный бонус
    else if (neighbors.length === 3) score += 10; // Край
    else if (neighbors.length === 2) score -= 20; // Угол - штраф

    // 3. Сколько новых клеток узнаем
    let newInfo = 0;
    neighbors.forEach((neighbor) => {
      if (gameBoard[neighbor.row][neighbor.col].state === CELL_STATES.UNKNOWN) {
        newInfo++;
      }
    });
    score += newInfo * 15;

    // 4. Бонус за отдаленность от уже открытых клеток
    // (чтобы исследовать новые зоны)
    let distanceFromKnown = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (gameBoard[r][c].state !== CELL_STATES.UNKNOWN) {
          const distance = Math.abs(r - row) + Math.abs(c - col);
          distanceFromKnown += distance;
        }
      }
    }
    score += distanceFromKnown * 0.5;

    return score;
  }

  // ФУНКЦИЯ: Определяет, стоит ли продолжать формацию
  function shouldContinueFormation(formationCells) {
    let formationOpened = 0;
    let otherNormalCells = 0;

    // Считаем сколько клеток формации открыто как NORMAL, GOLD ИЛИ имеют золотой контур
    for (const pos of formationCells) {
      const cell = gameBoard[pos.row][pos.col];
      if (cell.state === CELL_STATES.NORMAL || cell.state === CELL_STATES.GOLD || cell.hasGoldOutline) {
        formationOpened++;
      }
    }

    // Считаем сколько ДРУГИХ клеток открыто как NORMAL, GOLD или имеют контур
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Пропускаем клетки формации
        const isFormationCell = formationCells.some((pos) => pos.row === row && pos.col === col);

        if (!isFormationCell) {
          const cell = gameBoard[row][col];
          if (cell.state === CELL_STATES.NORMAL || cell.state === CELL_STATES.GOLD || cell.hasGoldOutline) {
            otherNormalCells++;
          }
        }
      }
    }

    // Если формация не начата (0 клеток) → можно начать
    if (formationOpened === 0) {
      return true;
    }

    // Если открыли значительно больше других клеток → переключиться
    if (otherNormalCells > formationOpened * 1.5) {
      return false;
    }

    // Если уже нашли 3-4 клетки формации → продолжать
    if (formationOpened >= 3) {
      return true;
    }

    // По умолчанию продолжаем, если начали
    return formationOpened > 0;
  }

  // Подсчет неизвестных клеток
  function countUnknownCells() {
    let count = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (gameBoard[row][col].state === CELL_STATES.UNKNOWN) {
          count++;
        }
      }
    }
    return count;
  }

  // Обновление подсказки следующего хода
  function updateNextMoveHint() {
    nextMoveHintCell = calculateNextMove();

    if (nextMoveHintCell) {
      nextMoveCellElement.textContent = `${nextMoveHintCell.row + 1},${nextMoveHintCell.col + 1}`;
      nextMoveCellElement.style.color = "#27ae60";
      nextMoveCellElement.style.fontWeight = "bold";

      // Помечаем клетку как рекомендованную
      gameBoard[nextMoveHintCell.row][nextMoveHintCell.col].isRecommended = true;
    } else {
      nextMoveCellElement.textContent = "--";
      nextMoveCellElement.style.color = "#666";
    }

    renderGameBoard();
  }

  // Переключение режима подсказки
  function toggleNextMoveMode() {
    nextMoveMode = !nextMoveMode;

    if (nextMoveMode) {
      nextMoveBtn.classList.add("active");
      nextMoveBtn.title = "Подсказка хода (вкл)";
      updateNextMoveHint();
      showToast("Режим подсказки включен. Лучший ход будет подсвечиваться.", "info");
    } else {
      nextMoveBtn.classList.remove("active");
      nextMoveBtn.title = "Подсказка хода";
      // Снимаем подсветку
      nextMoveHintCell = null;
      nextMoveCellElement.textContent = "--";
      nextMoveCellElement.style.color = "#666";
      renderGameBoard();
    }
  }

  // ЭКСПОРТ/ИМПОРТ
  function generateExportCode() {
    const codes = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gameBoard[row][col];

        let stateCode = CELL_CODES[cell.state];

        if (cell.hasGoldOutline) {
          stateCode = "o";
        }

        if (stateCode !== "u" || cell.hasGoldOutline) {
          const rowLetter = String.fromCharCode(65 + row);
          const cellCode = `${rowLetter}${col + 1}${stateCode}`;
          codes.push(cellCode);
        }
      }
    }

    return codes.join(",");
  }

  function showExportModal() {
    const code = generateExportCode();
    exportCodeElement.textContent = code;
    exportImportModal.classList.add("active");
    exportImportOverlay.classList.add("active");
  }

  function hideExportModal() {
    exportImportModal.classList.remove("active");
    exportImportOverlay.classList.remove("active");
  }

  function copyToClipboard() {
    const code = exportCodeElement.textContent;
    navigator.clipboard
      .writeText(code)
      .then(() => {
        const copyBtn = document.getElementById("copy-btn");
        copyBtn.textContent = "Скопировано!";
        copyBtn.classList.add("copied");

        setTimeout(() => {
          copyBtn.textContent = "Копировать";
          copyBtn.classList.remove("copied");
        }, 2000);
      })
      .catch((err) => {
        console.error("Ошибка копирования: ", err);
      });
  }

  function importBoard() {
    const code = importInput.value.trim();
    if (!code) return;

    try {
      initGameBoard();

      const parts = code.split(",");
      let importedCount = 0;

      parts.forEach((part) => {
        const match = part.match(/^([A-E])(\d+)([gnueo])$/i);
        if (match) {
          const rowLetter = match[1].toUpperCase();
          const col = parseInt(match[2]) - 1;
          const code = match[3].toLowerCase();

          const row = rowLetter.charCodeAt(0) - 65;

          if (row >= 0 && row < rows && col >= 0 && col < cols) {
            const cell = gameBoard[row][col];

            if (code === "o") {
              cell.state = CELL_STATES.UNKNOWN;
              cell.hasGoldOutline = true;
            } else {
              const state = CODE_CELLS[code];
              if (state) {
                cell.state = state;
                cell.hasGoldOutline = false;
              }
            }

            importedCount++;
          }
        }
      });

      analyzeBoard();
      renderGameBoard();
      updateCounters();
      if (nextMoveMode) updateNextMoveHint();

      importStatus.textContent = `Успешно загружено ${importedCount} клеток`;
      importStatus.className = "import-status success";
      importStatus.style.display = "block";

      importInput.value = "";

      setTimeout(() => {
        importStatus.style.display = "none";
      }, 3000);
    } catch (error) {
      importStatus.textContent = "Ошибка загрузки. Проверьте формат кода.";
      importStatus.className = "import-status error";
      importStatus.style.display = "block";
    }
  }

  // Инициализация предпросмотров тактик (старая версия)
  function initTacticPreviews() {
    createDiamondPreview();
    createCrossPreview();
    createDiagonalPreview();
    createTriangulationPreview();
    createExclusionPreview();
    createCornersPreview();
  }

  function createDiamondPreview() {
    const preview = document.getElementById("diamond-preview");
    preview.innerHTML = "";

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = document.createElement("div");
        cell.className = "preview-cell";

        const isStart =
          (row === 1 && col === 1) || (row === 1 && col === 4) || (row === 3 && col === 1) || (row === 3 && col === 4);

        if (isStart) {
          cell.style.backgroundColor = "#a3e4d7";
          cell.textContent = `${row + 1},${col + 1}`;
          cell.style.fontSize = "0.6rem";
        } else {
          cell.style.backgroundColor = "#bdc3c7";
        }

        preview.appendChild(cell);
      }
    }
  }

  function createCrossPreview() {
    const preview = document.getElementById("cross-preview");
    preview.innerHTML = "";

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = document.createElement("div");
        cell.className = "preview-cell";

        const isStart =
          (row === 1 && col === 2) || (row === 2 && col === 1) || (row === 2 && col === 4) || (row === 3 && col === 2);

        if (isStart) {
          cell.style.backgroundColor = "#a3e4d7";
          cell.textContent = `${row + 1},${col + 1}`;
          cell.style.fontSize = "0.6rem";
        } else {
          cell.style.backgroundColor = "#bdc3c7";
        }

        preview.appendChild(cell);
      }
    }
  }

  function createDiagonalPreview() {
    const preview = document.getElementById("diagonal-preview");
    preview.innerHTML = "";

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = document.createElement("div");
        cell.className = "preview-cell";

        const isStart =
          (row === 0 && col === 2) || (row === 1 && col === 4) || (row === 3 && col === 1) || (row === 4 && col === 3);

        if (isStart) {
          cell.style.backgroundColor = "#a3e4d7";
          cell.textContent = `${row + 1},${col + 1}`;
          cell.style.fontSize = "0.6rem";
        } else {
          cell.style.backgroundColor = "#bdc3c7";
        }

        preview.appendChild(cell);
      }
    }
  }

  function createTriangulationPreview() {
    const preview = document.getElementById("triangulation-preview");
    preview.innerHTML = "";

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = document.createElement("div");
        cell.className = "preview-cell";

        const isOutline = (row === 1 && col === 1) || (row === 1 && col === 3);
        const isGold = row === 1 && col === 2;

        if (isGold) {
          cell.style.backgroundColor = "#ffd700";
          cell.textContent = "★";
        } else if (isOutline) {
          cell.style.backgroundColor = "#ecf0f1";
          cell.style.border = "1px solid #ffa500";
        } else {
          cell.style.backgroundColor = "#bdc3c7";
        }

        preview.appendChild(cell);
      }
    }
  }

  function createExclusionPreview() {
    const preview = document.getElementById("exclusion-preview");
    preview.innerHTML = "";

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = document.createElement("div");
        cell.className = "preview-cell";

        const isCenter = row === 2 && col === 2;
        const isNeighbor =
          (row === 2 && col === 1) || (row === 2 && col === 3) || (row === 1 && col === 2) || (row === 3 && col === 2);

        if (isCenter) {
          cell.style.backgroundColor = "#ecf0f1";
          cell.style.border = "1px solid #7f8c8d";
        } else if (isNeighbor) {
          cell.style.backgroundColor = "#7f8c8d";
        } else {
          cell.style.backgroundColor = "#bdc3c7";
        }

        preview.appendChild(cell);
      }
    }
  }

  function createCornersPreview() {
    const preview = document.getElementById("corners-preview");
    preview.innerHTML = "";

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = document.createElement("div");
        cell.className = "preview-cell";

        const isCorner =
          (row === 0 && col === 0) || (row === 0 && col === 5) || (row === 4 && col === 0) || (row === 4 && col === 5);
        const isCenter = (row === 2 && col === 2) || (row === 2 && col === 3);

        if (isCorner) {
          cell.style.backgroundColor = "#ff6b6b";
          cell.textContent = "✗";
        } else if (isCenter) {
          cell.style.backgroundColor = "#a3e4d7";
          cell.textContent = "✓";
        } else {
          cell.style.backgroundColor = "#bdc3c7";
        }

        preview.appendChild(cell);
      }
    }
  }

  // Настройка обработчиков для карточек тактик
  function setupTacticCards() {
    document.querySelectorAll(".tactic-card").forEach((card) => {
      card.addEventListener("click", function () {
        const tactic = this.getAttribute("data-tactic");
        openTacticModal(tactic);
      });
    });
  }

  // Открытие модального окна с тактикой (старая версия с изображением)
  function openTacticModal(tactic) {
    let title = "";
    let rank = "";
    let content = "";

    if (tactic === "diamond") {
      title = "Алмазная формация";
      rank = "1";
      content = `
                        <div class="tactic-explanation">
                            <h4>Описание тактики</h4>
                            <p><strong>Лучший старт для поля 5×6!</strong> Откройте эти 4 клетки в любом порядке:</p>
                            <div class="coordinate-list">
                                <div class="coordinate-item">(2, 2)</div>
                                <div class="coordinate-item">(2, 5)</div>
                                <div class="coordinate-item">(4, 2)</div>
                                <div class="coordinate-item">(4, 5)</div>
                            </div>
                            <p><strong>Почему это работает:</strong></p>
                            <ul>
                                <li>Каждая клетка имеет по <strong>4 соседа</strong> (максимум)</li>
                                <li><strong>16 потенциальных соседей</strong> покрываются сразу</li>
                                <li>Симметричное расположение для равномерного охвата поля</li>
                                <li>Идеально для триангуляции золотых ячеек</li>
                            </ul>
                            <p><strong>Результат:</strong> Быстрое исключение пустых зон, максимальная информация с минимального количества ходов.</p>
                        </div>
                        <div class="tactic-visualization">
                            <div class="tactic-board" id="tactic-board">
                                <!-- Визуализация будет создана динамически -->
                            </div>
                            <div class="visual-label">Желтые клетки - оптимальные стартовые точки</div>
                        </div>
                    `;
    } else if (tactic === "cross") {
      title = "Центральный крест";
      rank = "2";
      content = `
                        <div class="tactic-explanation">
                            <h4>Описание тактики</h4>
                            <p><strong>Вторая по эффективности стратегия.</strong> Откройте эти 4 клетки:</p>
                            <div class="coordinate-list">
                                <div class="coordinate-item">(2, 3)</div>
                                <div class="coordinate-item">(3, 2)</div>
                                <div class="coordinate-item">(3, 5)</div>
                                <div class="coordinate-item">(4, 3)</div>
                            </div>
                            <p><strong>Преимущества:</strong></p>
                            <ul>
                                <li>Фокус на <strong>центральных столбцах</strong> (3 и 4)</li>
                                <li>Хорошо выявляет <strong>вертикальные кластеры</strong> золотых ячеек</li>
                                <li>Эффективен при асимметричном расположении золота</li>
                                <li>Создает интересные паттерны для анализа</li>
                            </ul>
                            <p><strong>Когда использовать:</strong> Если подозреваете, что золото сконцентрировано в центральной части поля.</p>
                        </div>
                        <div class="tactic-visualization">
                            <div class="tactic-board" id="tactic-board">
                                <!-- Визуализация будет создана динамически -->
                            </div>
                            <div class="visual-label">Стартовые точки образуют смещенный крест</div>
                        </div>
                    `;
    } else if (tactic === "diagonal") {
      title = "Диагональный сканер";
      rank = "3";
      content = `
                        <div class="tactic-explanation">
                            <h4>Описание тактики</h4>
                            <p><strong>Стратегия для продвинутых игроков.</strong> Откройте эти 4 клетки:</p>
                            <div class="coordinate-list">
                                <div class="coordinate-item">(1, 3)</div>
                                <div class="coordinate-item">(2, 5)</div>
                                <div class="coordinate-item">(4, 2)</div>
                                <div class="coordinate-item">(5, 4)</div>
                            </div>
                            <p><strong>Особенности тактики:</strong></p>
                            <ul>
                                <li>Диагональное расположение через всё поле</li>
                                <li>Эффективен против <strong>"диагонального" расположения</strong> золотых ячеек</li>
                                <li>Даёт информацию о <strong>крайних зонах</strong>, которые часто игнорируются</li>
                                <li>Создает нестандартные паттерны для анализа</li>
                            </ul>
                            <p><strong>Недостаток:</strong> Одна точка (1,3) имеет только 3 соседа вместо 4.</p>
                        </div>
                        <div class="tactic-visualization">
                            <div class="tactic-board" id="tactic-board">
                                <!-- Визуализация будет создана динамически -->
                            </div>
                            <div class="visual-label">Диагональное расположение стартовых точек</div>
                        </div>
                    `;
    } else if (tactic === "triangulation") {
      title = "Триангуляция";
      rank = "";
      content = `
                        <div class="tactic-explanation">
                            <h4>Описание тактики</h4>
                            <p><strong>Самый мощный прием в игре!</strong> Если вы открыли две клетки с золотыми контурами, и они указывают на одну и ту же клетку:</p>
                            <p><strong>Клетка А (золотой контур)</strong><br>
                            <strong>Клетка Б (не открыта)</strong><br>
                            <strong>Клетка В (золотой контур)</strong></p>
                            <p><strong>С вероятностью 99% золотая ячейка находится в Клетке Б!</strong></p>
                            <p><strong>Почему это работает:</strong> Каждый золотой контур указывает, что в одном из его соседей есть золото. Если два контура указывают на одну и ту же клетку, она почти наверняка золотая.</p>
                            <p><strong>Как использовать:</strong> Как только видите такую ситуацию — открывайте общую клетку первой!</p>
                        </div>
                        <div class="tactic-visualization">
                            <div class="tactic-board" id="tactic-board">
                                <!-- Визуализация будет создана динамически -->
                            </div>
                            <div class="visual-label">Контуры указывают на золотую ячейку между ними</div>
                        </div>
                    `;
    } else if (tactic === "exclusion") {
      title = "Метод исключения";
      rank = "";
      content = `
                        <div class="tactic-explanation">
                            <h4>Описание тактики</h4>
                            <p><strong>Самое важное для экономии ходов!</strong> Клетки с серыми или красными рамками показывают, где искать <strong>НЕ НАДО</strong>.</p>
                            <p><strong>Правило:</strong> Если клетка раскрыта (обычная) и не имеет золотого контура → все её соседи становятся пустыми.</p>
                            <p><strong>Пример:</strong> Если вы открыли клетку (3,3) и у неё нет золотого контура, то клетки (2,3), (3,2), (3,4), (4,3) точно пустые.</p>
                            <p><strong>Как использовать:</strong></p>
                            <ul>
                                <li>Не проверяйте соседей клеток с серыми/красными рамками</li>
                                <li>Отмечайте такие клетки как пустые в помощнике</li>
                                <li>Используйте эту информацию для сужения зоны поиска</li>
                            </ul>
                            <p><strong>Результат:</strong> Экономия 20-30% ходов за игру!</p>
                        </div>
                        <div class="tactic-visualization">
                            <div class="tactic-board" id="tactic-board">
                                <!-- Визуализация будет создана динамически -->
                            </div>
                            <div class="visual-label">Серая рамка и её пустые соседи</div>
                        </div>
                    `;
    } else if (tactic === "avoid-corners") {
      title = "Избегайте углов";
      rank = "";
      content = `
                        <div class="tactic-explanation">
                            <h4>Описание тактики</h4>
                            <p><strong>Основная ошибка новичков!</strong> Не начинайте игру с угловых клеток.</p>
                            <p><strong>Почему углы плохи:</strong></p>
                            <ul>
                                <li><strong>Угловая клетка имеет всего 2-3 соседа</strong> (вместо 4)</li>
                                <li>Мало информации с каждого хода</li>
                                <li>Сложнее триангулировать положение золотых ячеек</li>
                                <li>Хуже охват поля</li>
                            </ul>
                            <p><strong>Почему центр лучше:</strong></p>
                            <ul>
                                <li><strong>Центральная клетка имеет 4 соседа</strong> (максимум)</li>
                                <li>Больше информации с каждого хода</li>
                                <li>Лучше для триангуляции</li>
                                <li>Равномерный охват поля</li>
                            </ul>
                            <p><strong>Правило:</strong> Всегда начинайте с клеток, у которых 4 соседа!</p>
                        </div>
                        <div class="tactic-visualization">
                            <div class="tactic-board" id="tactic-board">
                                <!-- Визуализация будет создана динамически -->
                            </div>
                            <div class="visual-label">✗ - плохие стартовые точки, ✓ - хорошие</div>
                        </div>
                    `;
    }

    // Устанавливаем заголовок и контент
    modalTitle.textContent = title;
    modalRank.textContent = rank;
    if (rank === "") {
      modalRank.style.display = "none";
    } else {
      modalRank.style.display = "inline-block";
    }
    modalContent.innerHTML = content;

    // Создаем визуализацию для текущей тактики
    createTacticVisualization(tactic);

    // Показываем модальное окно
    modalOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  // Создание визуализации для модального окна (старая версия)
  function createTacticVisualization(tactic) {
    const board = document.getElementById("tactic-board");
    if (!board) return;

    board.innerHTML = "";

    if (tactic === "diamond") {
      // Визуализация алмазной формации
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = document.createElement("div");

          // Алмазная формация
          const isStart =
            (row === 1 && col === 1) ||
            (row === 1 && col === 4) ||
            (row === 3 && col === 1) ||
            (row === 3 && col === 4);

          if (isStart) {
            cell.className = "visual-cell start";
            cell.textContent = `${row + 1},${col + 1}`;
          } else {
            cell.className = "visual-cell normal";
          }

          board.appendChild(cell);
        }
      }
    } else if (tactic === "cross") {
      // Визуализация центрального креста
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = document.createElement("div");

          // Центральный крест
          const isStart =
            (row === 1 && col === 2) ||
            (row === 2 && col === 1) ||
            (row === 2 && col === 4) ||
            (row === 3 && col === 2);

          if (isStart) {
            cell.className = "visual-cell start";
            cell.textContent = `${row + 1},${col + 1}`;
          } else {
            cell.className = "visual-cell normal";
          }

          board.appendChild(cell);
        }
      }
    } else if (tactic === "diagonal") {
      // Визуализация диагонального сканера
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = document.createElement("div");

          // Диагональный сканер
          const isStart =
            (row === 0 && col === 2) ||
            (row === 1 && col === 4) ||
            (row === 3 && col === 1) ||
            (row === 4 && col === 3);

          if (isStart) {
            cell.className = "visual-cell start";
            cell.textContent = `${row + 1},${col + 1}`;
          } else {
            cell.className = "visual-cell normal";
          }

          board.appendChild(cell);
        }
      }
    } else if (tactic === "triangulation") {
      // Визуализация триангуляции
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = document.createElement("div");

          // Два контура с золотой ячейкой между ними
          const isOutline = (row === 1 && col === 1) || (row === 1 && col === 3);
          const isGold = row === 1 && col === 2;

          if (isGold) {
            cell.className = "visual-cell gold";
            cell.textContent = "★";
          } else if (isOutline) {
            cell.className = "visual-cell gold-outline";
            cell.textContent = "A/C";
          } else if (row === 1 && col === 2) {
            cell.className = "visual-cell target";
            cell.textContent = "Б";
          } else {
            cell.className = "visual-cell normal";
          }

          board.appendChild(cell);
        }
      }
    } else if (tactic === "exclusion") {
      // Визуализация метода исключения
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = document.createElement("div");

          // Центральная клетка с серой рамкой и её соседи
          const isCenter = row === 2 && col === 2;
          const isNeighbor =
            (row === 2 && col === 1) ||
            (row === 2 && col === 3) ||
            (row === 1 && col === 2) ||
            (row === 3 && col === 2);

          if (isCenter) {
            cell.className = "visual-cell normal";
            cell.textContent = "X";
          } else if (isNeighbor) {
            cell.className = "visual-cell empty";
            cell.textContent = "✗";
          } else {
            cell.className = "visual-cell normal";
          }

          board.appendChild(cell);
        }
      }
    } else if (tactic === "avoid-corners") {
      // Визуализация "Избегайте углов"
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = document.createElement("div");

          // Углы vs центр
          const isCorner =
            (row === 0 && col === 0) ||
            (row === 0 && col === 5) ||
            (row === 4 && col === 0) ||
            (row === 4 && col === 5);
          const isCenter = (row === 2 && col === 2) || (row === 2 && col === 3);

          if (isCorner) {
            cell.className = "visual-cell empty";
            cell.textContent = "✗";
          } else if (isCenter) {
            cell.className = "visual-cell start";
            cell.textContent = "✓";
          } else {
            cell.className = "visual-cell normal";
          }

          board.appendChild(cell);
        }
      }
    }
  }

  // Вспомогательная функция для показа уведомлений
  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 12px 20px;
                    border-radius: 6px;
                    color: white;
                    font-weight: bold;
                    z-index: 2000;
                    opacity: 0;
                    transform: translateX(100px);
                    transition: opacity 0.3s, transform 0.3s;
                `;

    if (type === "success") {
      toast.style.backgroundColor = "#27ae60";
    } else if (type === "error") {
      toast.style.backgroundColor = "#e74c3c";
    } else {
      toast.style.backgroundColor = "#3498db";
    }

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(0)";
    }, 10);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100px)";
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }

  // Закрытие модальных окон
  function closeModal() {
    modalOverlay.classList.remove("active");
    document.body.style.overflow = "auto";
  }

  // Проверка валидности клетки
  function isValidCell(row, col) {
    return row >= 0 && row < rows && col >= 0 && col < cols;
  }

  // Получение соседних клеток
  function getAdjacentCells(row, col) {
    const neighbors = [];

    if (row > 0) neighbors.push({ row: row - 1, col });
    if (row < rows - 1) neighbors.push({ row: row + 1, col });
    if (col > 0) neighbors.push({ row, col: col - 1 });
    if (col < cols - 1) neighbors.push({ row, col: col + 1 });

    return neighbors;
  }

  // Отрисовка игрового поля
  function renderGameBoard() {
    gameBoardElement.innerHTML = "";

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gameBoard[row][col];
        const cellElement = document.createElement("div");

        let cellClass = `cell ${cell.state}`;

        const isEmpty = emptyCells.some((emptyCell) => emptyCell.row === row && emptyCell.col === col);

        const isPossibleGold = possibleGoldCells.some(
          (goldCell) => goldCell.row === row && goldCell.col === col && goldCell.chance >= 50
        );

        if (cell.state === CELL_STATES.GOLD) {
          cellClass = `cell ${CELL_STATES.GOLD}`;
        } else if (isEmpty && cell.state === CELL_STATES.UNKNOWN) {
          cellClass = `cell ${CELL_STATES.EMPTY}`;
          cellElement.textContent = "";
        } else if (isPossibleGold && cell.state === CELL_STATES.UNKNOWN) {
          cellClass = `cell ${CELL_STATES.POSSIBLE_GOLD}`;
        } else if (cell.state === CELL_STATES.NORMAL) {
          cellClass = `cell ${CELL_STATES.NORMAL}`;
        } else {
          cellClass = `cell ${CELL_STATES.UNKNOWN}`;
        }

        cellElement.className = cellClass;

        const cellNumber = document.createElement("div");
        cellNumber.className = "cell-number";
        cellNumber.textContent = `${row + 1},${col + 1}`;
        cellElement.appendChild(cellNumber);

        if (cell.hasGoldOutline) {
          cellElement.classList.add("gold-outline");
        }

        if (nextMoveMode && cell.isRecommended) {
          cellElement.classList.add("next-move-hint");
        }

        if (cell.state === CELL_STATES.GOLD) {
          cellClass = `cell ${CELL_STATES.GOLD}`;
          cellElement.textContent = "★";
        }

        if (cell.goldChance > 0 && cell.state === CELL_STATES.UNKNOWN) {
          const chanceElement = document.createElement("div");
          chanceElement.className = "gold-chance";

          if (cell.goldChance >= 50) {
            chanceElement.classList.add("high");
          } else {
            chanceElement.classList.add("low");
          }

          chanceElement.textContent = `${Math.round(cell.goldChance)}%`;
          cellElement.appendChild(chanceElement);
        }

        cellElement.addEventListener("click", () => handleCellClick(row, col));

        gameBoardElement.appendChild(cellElement);
      }
    }
  }

  // Обработка клика по клетке
  function handleCellClick(row, col) {
    const cell = gameBoard[row][col];

    if (outlineMode) {
      // Режим контуров: ТОЛЬКО переключаем контур
      cell.hasGoldOutline = !cell.hasGoldOutline;
    } else {
      // Обычный режим: меняем ТОЛЬКО состояние, контур НЕ трогаем
      if (cell.state === CELL_STATES.UNKNOWN) {
        cell.state = CELL_STATES.NORMAL;
      } else if (cell.state === CELL_STATES.NORMAL) {
        cell.state = CELL_STATES.GOLD;
      } else if (cell.state === CELL_STATES.GOLD) {
        cell.state = CELL_STATES.UNKNOWN;
      }
      // Если cell.state === CELL_STATES.EMPTY или другие - оставляем как есть
    }

    analyzeBoard();
    renderGameBoard();
    updateCounters();
    if (nextMoveMode) updateNextMoveHint();
  }

  // Анализ поля с улучшенной логикой (добавлен логический вывод)
  function analyzeBoard() {
    emptyCells = [];
    possibleGoldCells = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        gameBoard[row][col].goldChance = 0;
      }
    }

    // ШАГ 1: ПУСТЫЕ СОСЕДИ КЛЕТОК БЕЗ КОНТУРОВ
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = gameBoard[row][col];

        // Если это ОБЫЧНАЯ или ЗОЛОТАЯ клетка БЕЗ контура
        if ((cell.state === CELL_STATES.NORMAL || cell.state === CELL_STATES.GOLD) && !cell.hasGoldOutline) {
          const neighbors = getAdjacentCells(row, col);

          neighbors.forEach((neighbor) => {
            const neighborCell = gameBoard[neighbor.row][neighbor.col];

            // Если сосед неизвестен и не золотой
            if (neighborCell.state === CELL_STATES.UNKNOWN) {
              if (!emptyCells.some((c) => c.row === neighbor.row && c.col === neighbor.col)) {
                emptyCells.push({ row: neighbor.row, col: neighbor.col });
              }
            }
          });
        }
      }
    }

    // ШАГ 2: СОБИРАЕМ КЛЕТКИ С КОНТУРАМИ
    const outlineCells = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (gameBoard[row][col].hasGoldOutline) {
          outlineCells.push({ row, col });
        }
      }
    }

    // ШАГ 3: ЛОГИЧЕСКИЙ ВЫВОД - ПРИНУДИТЕЛЬНОЕ ЗОЛОТО
    // Если у контура остался только один неизвестный сосед - он должен быть золотым
    const forcedGoldCells = [];

    outlineCells.forEach((outlineCell) => {
      const { row, col } = outlineCell;
      const neighbors = getAdjacentCells(row, col);

      // Считаем сколько у контура уже найдено золота и сколько неизвестных соседей
      let goldCount = 0;
      let unknownNeighbors = [];

      neighbors.forEach((neighbor) => {
        const neighborCell = gameBoard[neighbor.row][neighbor.col];
        if (neighborCell.state === CELL_STATES.GOLD) {
          goldCount++;
        } else if (
          neighborCell.state === CELL_STATES.UNKNOWN &&
          !emptyCells.some((ec) => ec.row === neighbor.row && ec.col === neighbor.col)
        ) {
          unknownNeighbors.push(neighbor);
        }
      });

      // Если у контура еще не найдено золото и остался только один неизвестный сосед
      // Этот сосед ДОЛЖЕН быть золотым (минимум 1 золото!)
      if (goldCount === 0 && unknownNeighbors.length === 1) {
        const forcedGold = unknownNeighbors[0];
        forcedGoldCells.push(forcedGold);
      }
    });

    // ШАГ 4: АНАЛИЗ КОНТУРОВ
    const goldChanceMap = new Map();

    outlineCells.forEach((outlineCell) => {
      const { row, col } = outlineCell;
      const neighbors = getAdjacentCells(row, col);

      let goldCount = 0;
      let normalCount = 0;
      let unknownCount = 0;

      neighbors.forEach((neighbor) => {
        const neighborCell = gameBoard[neighbor.row][neighbor.col];
        if (neighborCell.state === CELL_STATES.GOLD) goldCount++;
        if (neighborCell.state === CELL_STATES.NORMAL) normalCount++;
        if (neighborCell.state === CELL_STATES.UNKNOWN) unknownCount++;
      });

      // Базовый шанс для этого контура
      let baseChancePerCell = 0;

      if (goldCount === 0) {
        // Если у контура нет золота, минимум 1 золото должно быть среди соседей
        if (unknownCount > 0) {
          baseChancePerCell = 100 / unknownCount;
        }
      } else {
        // Если у контура уже есть золото, шансы снижаются
        baseChancePerCell = Math.max(100 - goldCount * 50, 10) / Math.max(unknownCount, 1);
      }

      // Применяем шансы к каждому неизвестному соседу
      neighbors.forEach((neighbor) => {
        const neighborCell = gameBoard[neighbor.row][neighbor.col];

        if (
          neighborCell.state === CELL_STATES.UNKNOWN &&
          !emptyCells.some((ec) => ec.row === neighbor.row && ec.col === neighbor.col)
        ) {
          const key = `${neighbor.row},${neighbor.col}`;
          let currentChance = baseChancePerCell;

          if (goldChanceMap.has(key)) {
            // ВАЖНО: СУММИРУЕМ шансы от разных контуров, но не более 95%
            const existingChance = goldChanceMap.get(key).chance;
            currentChance = existingChance + baseChancePerCell * 0.7; // Коэффициент 0.7 чтобы не зашкаливало
          }

          goldChanceMap.set(key, {
            row: neighbor.row,
            col: neighbor.col,
            chance: Math.min(currentChance, 95),
          });
        }
      });
    });

    // ШАГ 4.5: ОСОБАЯ ОБРАБОТКА КЛЕТОК МЕЖДУ КОНТУРАМИ
    goldChanceMap.forEach((value, key) => {
      const { row, col, chance } = value;

      // Проверяем, от скольких контуров эта клетка получает шансы
      let outlineCount = 0;
      const neighbors = getAdjacentCells(row, col);

      neighbors.forEach((neighbor) => {
        if (gameBoard[neighbor.row][neighbor.col].hasGoldOutline) {
          outlineCount++;
        }
      });

      // Если клетка получает шансы от 2+ контуров
      if (outlineCount >= 2) {
        // Повышаем шанс значительно
        const boostedChance = Math.min(chance * 1.5, 90);
        goldChanceMap.set(key, {
          row: row,
          col: col,
          chance: boostedChance,
        });

        // Дополнительно: если клетка находится РЯДОМ с двумя контурами
        // (не обязательно сосед обоих, но в зоне влияния)
        // Это потенциальная триангуляция!
      }
    });

    // ШАГ 5: ТРИАНГУЛЯЦИЯ (МАКСИМАЛЬНЫЙ ШАНС)
    for (let i = 0; i < outlineCells.length; i++) {
      for (let j = i + 1; j < outlineCells.length; j++) {
        const cell1 = outlineCells[i];
        const cell2 = outlineCells[j];

        // Проверяем все возможные клетки между контурами
        // Горизонтальное соседство
        if (cell1.row === cell2.row && Math.abs(cell1.col - cell2.col) === 2) {
          const middleCol = Math.min(cell1.col, cell2.col) + 1;
          const middleRow = cell1.row;

          // ИСПРАВЛЕННАЯ СТРОКА - добавлена проверка hasGoldOutline
          if (
            isValidCell(middleRow, middleCol) &&
            gameBoard[middleRow][middleCol].state === CELL_STATES.UNKNOWN &&
            !gameBoard[middleRow][middleCol].hasGoldOutline
          ) {
            const key = `${middleRow},${middleCol}`;
            goldChanceMap.set(key, {
              row: middleRow,
              col: middleCol,
              chance: 95, // Максимальный шанс для триангуляции
            });
          }
        }

        // Вертикальное соседство
        if (cell1.col === cell2.col && Math.abs(cell1.row - cell2.row) === 2) {
          const middleRow = Math.min(cell1.row, cell2.row) + 1;
          const middleCol = cell1.col;

          // ИСПРАВЛЕННАЯ СТРОКА
          if (
            isValidCell(middleRow, middleCol) &&
            gameBoard[middleRow][middleCol].state === CELL_STATES.UNKNOWN &&
            !gameBoard[middleRow][middleCol].hasGoldOutline
          ) {
            const key = `${middleRow},${middleCol}`;
            goldChanceMap.set(key, {
              row: middleRow,
              col: middleCol,
              chance: 95,
            });
          }
        }

        // Диагональное соседство
        if (Math.abs(cell1.row - cell2.row) === 1 && Math.abs(cell1.col - cell2.col) === 1) {
          // Клетка, которая соседствует с обоими контурами
          const possibleCells = [
            { row: cell1.row, col: cell2.col },
            { row: cell2.row, col: cell1.col },
          ];

          possibleCells.forEach((pos) => {
            // ИСПРАВЛЕННАЯ СТРОКА - используем pos.row и pos.col
            if (
              isValidCell(pos.row, pos.col) &&
              gameBoard[pos.row][pos.col].state === CELL_STATES.UNKNOWN &&
              !gameBoard[pos.row][pos.col].hasGoldOutline
            ) {
              const key = `${pos.row},${pos.col}`;
              const existingChance = goldChanceMap.has(key) ? goldChanceMap.get(key).chance : 0;
              goldChanceMap.set(key, {
                row: pos.row,
                col: pos.col,
                chance: Math.max(existingChance, 80), // Высокий шанс
              });
            }
          });
        }
      }
    }

    // ШАГ 6: ПРИМЕНЯЕМ ПРИНУДИТЕЛЬНОЕ ЗОЛОТО (100% ШАНС)
    forcedGoldCells.forEach((forcedGold) => {
      const key = `${forcedGold.row},${forcedGold.col}`;
      goldChanceMap.set(key, {
        row: forcedGold.row,
        col: forcedGold.col,
        chance: 100,
      });
    });

    // ШАГ 7: ОБНОВЛЯЕМ ШАНСЫ
    goldChanceMap.forEach((value, key) => {
      const { row, col, chance } = value;

      const finalChance = Math.min(chance, 100);
      gameBoard[row][col].goldChance = finalChance;

      if (finalChance >= 50 && gameBoard[row][col].state === CELL_STATES.UNKNOWN) {
        possibleGoldCells.push({ row, col, chance: finalChance });
      }
    });

    // ШАГ 8: УЧИТЫВАЕМ НАЙДЕННЫЕ ЗОЛОТЫЕ ЯЧЕЙКИ
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (gameBoard[row][col].state === CELL_STATES.GOLD) {
          const neighbors = getAdjacentCells(row, col);

          neighbors.forEach((neighbor) => {
            if (
              isValidCell(neighbor.row, neighbor.col) &&
              gameBoard[neighbor.row][neighbor.col].hasGoldOutline &&
              gameBoard[neighbor.row][neighbor.col].state === CELL_STATES.UNKNOWN
            ) {
              // Клетки с контурами не могут быть золотыми (оставляем это правило)
              if (!emptyCells.some((c) => c.row === neighbor.row && c.col === neighbor.col)) {
                emptyCells.push({ row: neighbor.row, col: neighbor.col });
              }

              const index = possibleGoldCells.findIndex((c) => c.row === neighbor.row && c.col === neighbor.col);
              if (index !== -1) {
                possibleGoldCells.splice(index, 1);
              }

              gameBoard[neighbor.row][neighbor.col].goldChance = 0;
            }
          });
        }
      }
    }

    // ШАГ 9: КЛЕТКИ С КОНТУРАМИ НЕ МОГУТ БЫТЬ ЗОЛОТЫМИ
    outlineCells.forEach((cell) => {
      if (gameBoard[cell.row][cell.col].state === CELL_STATES.UNKNOWN) {
        if (!emptyCells.some((c) => c.row === cell.row && c.col === cell.col)) {
          emptyCells.push({ row: cell.row, col: cell.col });
        }

        const index = possibleGoldCells.findIndex((c) => c.row === cell.row && c.col === cell.col);
        if (index !== -1) {
          possibleGoldCells.splice(index, 1);
        }

        gameBoard[cell.row][cell.col].goldChance = 0;
      }
    });

    updateCounters();
  }

  // Обновление счетчиков
  function updateCounters() {
    let goldCount = 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (gameBoard[row][col].state === CELL_STATES.GOLD) {
          goldCount++;
        }
      }
    }

    goldCountElement.textContent = goldCount;
    emptyCountElement.textContent = emptyCells.length;
    possibleGoldCountElement.textContent = possibleGoldCells.length;
  }

  // Переключение режима контуров
  function toggleOutlineMode() {
    outlineMode = !outlineMode;

    if (outlineMode) {
      outlineModeBtn.classList.add("active");
      showToast("Режим золотых контуров включен. Кликайте на клетки чтобы добавить/убрать контур", "info");
    } else {
      outlineModeBtn.classList.remove("active");
    }
  }

  // Назначение обработчиков событий
  newGameBtn.addEventListener("click", initGameBoard);
  outlineModeBtn.addEventListener("click", toggleOutlineMode);
  nextMoveBtn.addEventListener("click", toggleNextMoveMode);
  exportBtn.addEventListener("click", showExportModal);

  // Обработчики для экспорта/импорта
  copyBtn.addEventListener("click", copyToClipboard);
  loadBtn.addEventListener("click", importBoard);
  closeExportModal.addEventListener("click", hideExportModal);

  importInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      importBoard();
    }
  });

  // === КОД ДЛЯ МОДАЛКИ ПЕРВОГО ЗАПУСКА ===
  // Этот код должен быть ПОСЛЕДНИМ в script

  // Ждём полной загрузки DOM
  window.addEventListener("load", function () {
    initTutorialModal();
  });

  function initTutorialModal() {
    const firstLaunchModal = document.getElementById("first-launch-modal");
    const closeFirstLaunchBtn = document.getElementById("first-launch-close");
    const prevStepBtn = document.getElementById("prev-step");
    const nextStepBtn = document.getElementById("next-step");
    const skipTutorialBtn = document.getElementById("skip-tutorial");
    const dontShowAgainCheckbox = document.getElementById("dont-show-again");
    const stepDots = document.querySelectorAll(".step-dot");
    const helpBtn = document.getElementById("help-btn");

    // Проверяем, что элементы существуют
    if (!firstLaunchModal) {
      console.error("Модалка не найдена! Проверьте ID");
      return;
    }

    let currentStep = 1;
    const totalSteps = 4;

    // Инициализация интерактивной ячейки
    const demoCell = document.getElementById("demo-cell");
    const demoCellContent = document.getElementById("demo-cell-content");
    const demoStatus = document.getElementById("demo-status");

    let demoCellState = 0;
    const demoStates = [
      { class: "unknown", symbol: "?", text: "Неизвестно" },
      { class: "normal", symbol: "", text: "Обычная" },
      { class: "gold", symbol: "★", text: "Золотая" },
    ];

    function initDemoCell() {
      if (demoCell) {
        updateDemoCell();
        demoCell.addEventListener("click", function () {
          demoCellState = (demoCellState + 1) % demoStates.length;
          updateDemoCell();
        });
      }
    }

    function updateDemoCell() {
      if (!demoCell) return;

      const state = demoStates[demoCellState];
      demoCell.className = "demo-cell";
      demoCell.classList.add(state.class);
      demoCellContent.textContent = state.symbol;
      demoStatus.textContent = `Текущий статус: ${state.text}`;
    }

    // Функция переключения шагов
    function goToStep(step) {
      // Скрываем текущий шаг
      const currentStepEl = document.querySelector(`.tutorial-step[data-step="${currentStep}"]`);
      const currentDot = document.querySelector(`.step-dot[data-step="${currentStep}"]`);

      if (currentStepEl) currentStepEl.classList.remove("active");
      if (currentDot) currentDot.classList.remove("active");

      // Показываем новый шаг
      currentStep = step;
      const newStepEl = document.querySelector(`.tutorial-step[data-step="${currentStep}"]`);
      const newDot = document.querySelector(`.step-dot[data-step="${currentStep}"]`);

      if (newStepEl) newStepEl.classList.add("active");
      if (newDot) newDot.classList.add("active");

      // Обновляем кнопки
      if (prevStepBtn) prevStepBtn.disabled = currentStep === 1;
      if (nextStepBtn) {
        nextStepBtn.textContent = currentStep === totalSteps ? "Начать игру" : "Далее";
      }
    }

    // Показать/скрыть модалку
    function showTutorialModal() {
      firstLaunchModal.classList.add("active");
      document.body.style.overflow = "hidden";
      goToStep(1);
      initDemoCell();
    }

    function hideTutorialModal() {
      firstLaunchModal.classList.remove("active");
      document.body.style.overflow = "auto";

      if (dontShowAgainCheckbox && dontShowAgainCheckbox.checked) {
        localStorage.setItem("tutorialShown", "true");
      }
    }

    // Проверяем, нужно ли показывать модалку
    const tutorialShown = localStorage.getItem("tutorialShown");
    if (!tutorialShown) {
      // Задержка для плавного появления
      setTimeout(showTutorialModal, 800);
    }

    // Назначаем обработчики событий
    if (nextStepBtn) {
      nextStepBtn.addEventListener("click", function () {
        if (currentStep < totalSteps) {
          goToStep(currentStep + 1);
        } else {
          hideTutorialModal();
          showToast("Теперь вы готовы к игре! Удачи в поиске золота!", "success");
        }
      });
    }

    if (prevStepBtn) {
      prevStepBtn.addEventListener("click", function () {
        if (currentStep > 1) {
          goToStep(currentStep - 1);
        }
      });
    }

    if (skipTutorialBtn) {
      skipTutorialBtn.addEventListener("click", hideTutorialModal);
    }

    if (closeFirstLaunchBtn) {
      closeFirstLaunchBtn.addEventListener("click", hideTutorialModal);
    }

    if (stepDots) {
      stepDots.forEach((dot) => {
        dot.addEventListener("click", function () {
          const step = parseInt(this.getAttribute("data-step"));
          if (!isNaN(step)) {
            goToStep(step);
          }
        });
      });
    }

    if (helpBtn) {
      helpBtn.addEventListener("click", showTutorialModal);
    }

    // Закрытие по клику вне модалки
    firstLaunchModal.addEventListener("click", function (e) {
      if (e.target === firstLaunchModal) {
        hideTutorialModal();
      }
    });

    // Закрытие по Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && firstLaunchModal.classList.contains("active")) {
        hideTutorialModal();
      }
    });

    // Обработчики для модального окна
    closeModalBtn.addEventListener("click", closeModal);
    modalOverlay.addEventListener("click", function (e) {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    // Закрытие по Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (modalOverlay.classList.contains("active")) {
          closeModal();
        }
        if (exportImportModal.classList.contains("active")) {
          hideExportModal();
        }
      }
    });

    // Стили для демо-ячейки
    const demoCellStyles = `
        .demo-cell.unknown { background-color: #bdc3c7; }
        .demo-cell.normal { background-color: #ecf0f1; }
        .demo-cell.gold {
            background-color: #ffd700;
            box-shadow: inset 0 0 10px rgba(184, 134, 11, 0.5);
        }
        .demo-cell.empty {
            background-color: #7f8c8d;
            color: white;
        }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.textContent = demoCellStyles;
    document.head.appendChild(styleSheet);
  }

  // Инициализация игры
  initGameBoard();
  analyzeBoard();
});
