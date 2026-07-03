const habits = [
  { id: "studying", name: "Studying", icon: "📚", tone: "#e8f1ff" },
  { id: "walking", name: "Walking", icon: "🚶‍♀️", tone: "#e3f5ed" },
  { id: "reading", name: "Reading", icon: "🏰", tone: "#f4e9ff" },
  { id: "cooking", name: "Cooking", icon: "🍳", tone: "#fff0cf" },
  { id: "cleaning", name: "Cleaning", icon: "🧼", tone: "#dff4f7" },
  { id: "workout", name: "Workout", icon: "🎾", tone: "#ffe4e9" },
  { id: "television", name: "Television", icon: "📺", tone: "#e9ecff" },
  { id: "badminton", name: "Badminton", icon: "🏸", tone: "#e9f7dc" },
];

const storageKey = "daily-habits-v1";
const todayKey = toDateKey(new Date());
let selectedDate = new Date();
let state = { completions: {} };

const habitList = document.querySelector("#habit-list");
const template = document.querySelector("#habit-template");
const completeCount = document.querySelector("#complete-count");
const leftCount = document.querySelector("#left-count");
const streakCount = document.querySelector("#streak-count");
const resetButton = document.querySelector("#reset-day");
const dateLabel = document.querySelector("#date-label");
const selectedDayTitle = document.querySelector("#selected-day-title");
const previousDayButton = document.querySelector("#previous-day");
const nextDayButton = document.querySelector("#next-day");
const datePicker = document.querySelector("#date-picker");

init();

resetButton.addEventListener("click", () => {
  const selectedDateKey = getSelectedDateKey();
  habits.forEach((habit) => {
    delete state.completions[habit.id]?.[selectedDateKey];
  });
  saveState();
  render();
});

previousDayButton.addEventListener("click", () => changeSelectedDay(-1));
nextDayButton.addEventListener("click", () => changeSelectedDay(1));
datePicker.addEventListener("change", () => {
  selectedDate = dateFromKey(datePicker.value);
  render();
});

async function init() {
  const backendState = await loadBackendState();
  const localState = loadLocalState();
  state = mergeStates(localState, backendState);
  if (JSON.stringify(state) !== JSON.stringify(backendState)) {
    await saveState();
  }
  render();
}

function render() {
  const selectedDateKey = getSelectedDateKey();
  dateLabel.textContent = formatLongDate(selectedDate);
  selectedDayTitle.textContent =
    selectedDateKey === todayKey ? "Today" : formatShortDate(selectedDate);
  datePicker.value = selectedDateKey;

  habitList.textContent = "";

  habits.forEach((habit) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const button = card.querySelector(".habit-toggle");
    const icon = card.querySelector(".habit-icon");
    const name = card.querySelector(".habit-name");
    const meta = card.querySelector(".habit-meta");
    const isDone = Boolean(state.completions[habit.id]?.[selectedDateKey]);
    const streak = getStreakEndingOn(habit.id, selectedDate);

    card.classList.toggle("is-done", isDone);
    card.style.setProperty("--tone", habit.tone);
    button.setAttribute("aria-pressed", String(isDone));
    button.dataset.habitId = habit.id;
    icon.textContent = habit.icon;
    name.textContent = habit.name;
    meta.textContent = isDone
      ? streak === 1
        ? "Started a streak"
        : `${streak} day streak`
      : "Tap when complete";

    button.addEventListener("click", () => toggleHabit(habit.id));
    habitList.append(card);
  });

  updateSummary();
}

function toggleHabit(id) {
  const selectedDateKey = getSelectedDateKey();
  state.completions[id] ||= {};
  state.completions[id][selectedDateKey] = !state.completions[id][selectedDateKey];
  if (!state.completions[id][selectedDateKey]) {
    delete state.completions[id][selectedDateKey];
  }
  saveState();
  render();
}

function changeSelectedDay(offset) {
  selectedDate.setDate(selectedDate.getDate() + offset);
  selectedDate = new Date(selectedDate);
  render();
}

function updateSummary() {
  const selectedDateKey = getSelectedDateKey();
  const completedForDay = habits.filter((habit) => state.completions[habit.id]?.[selectedDateKey])
    .length;
  const bestStreak = Math.max(...habits.map((habit) => getStreakEndingOn(habit.id, selectedDate)));

  completeCount.textContent = String(completedForDay);
  leftCount.textContent = String(habits.length - completedForDay);
  streakCount.textContent = String(bestStreak);
}

function getStreakEndingOn(id, startDate) {
  let streak = 0;
  const date = new Date(startDate);

  while (state.completions[id]?.[toDateKey(date)]) {
    streak += 1;
    date.setDate(date.getDate() - 1);
  }

  return streak;
}

function getSelectedDateKey() {
  return toDateKey(selectedDate);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

async function loadBackendState() {
  try {
    const response = await fetch("/api/state");
    if (!response.ok) {
      throw new Error("Could not load habit data");
    }
    const savedState = await response.json();
    return isValidState(savedState) ? savedState : { completions: {} };
  } catch {
    return { completions: {} };
  }
}

async function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  try {
    await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  } catch {
    // Keep the local copy so the user's checkmark is not lost if the backend is offline.
  }
}

function loadLocalState() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    return isValidState(stored) ? stored : { completions: {} };
  } catch {
    return { completions: {} };
  }
}

function isValidState(savedState) {
  return savedState && typeof savedState === "object" && typeof savedState.completions === "object";
}

function mergeStates(...states) {
  const merged = { completions: {} };

  states.forEach((savedState) => {
    if (!isValidState(savedState)) {
      return;
    }

    Object.entries(savedState.completions).forEach(([habitId, dates]) => {
      merged.completions[habitId] ||= {};
      Object.entries(dates || {}).forEach(([dateKey, isComplete]) => {
        if (isComplete) {
          merged.completions[habitId][dateKey] = true;
        }
      });
    });
  });

  return merged;
}
