export function calculateNextPomodoro(totalCompleted, pomodorosPerCycle, shortBreakMinutes, longBreakMinutes) {
  const totalAfter = totalCompleted + 1;
  let indexInCycle = totalAfter % pomodorosPerCycle;
  if (indexInCycle === 0) {
    indexInCycle = pomodorosPerCycle;
  }

  const cyclesDoneBeforeThisPomodoro = Math.floor((totalAfter - 1) / pomodorosPerCycle);
  const cycleNumber = cyclesDoneBeforeThisPomodoro + 1;
  const isCycleEnd = indexInCycle === pomodorosPerCycle;

  return {
    totalAfter,
    cycleNumber,
    indexInCycle,
    isCycleEnd,
    breakMinutes: isCycleEnd ? longBreakMinutes : shortBreakMinutes,
  };
}

export function calculateCycleProgress(totalCompleted, pomodorosPerCycle, shortBreakMinutes, longBreakMinutes) {
  let indexInCycle = totalCompleted % pomodorosPerCycle;
  if (indexInCycle === 0 && totalCompleted > 0) {
    indexInCycle = pomodorosPerCycle;
  }

  const cyclesDone = Math.floor(totalCompleted / pomodorosPerCycle);
  const isCycleEnd = indexInCycle === pomodorosPerCycle && totalCompleted > 0;

  return {
    totalPomodoros: totalCompleted,
    indexInCycle: totalCompleted === 0 ? 1 : indexInCycle,
    cyclesDone,
    isCycleEnd,
    nextBreakMinutes: isCycleEnd ? longBreakMinutes : shortBreakMinutes,
  };
}
