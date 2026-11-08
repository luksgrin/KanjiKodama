import type { SrsSystemData } from '../content';
import { DAY, HOUR, MINUTE, SECOND, WEEK } from '../time';

/** The id of the Locked pseudo stage every system has (`SrsSystem` adds it in its constructor). */
export const LOCKED_STAGE_ID = -999;

/** A Roman numeral (I, II, …). */
export function romanNumeral(number: number): string {
  let n = number;
  if (n < 1) {
    return String(n);
  }
  const parts: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let s = '';
  for (const [value, letters] of parts) {
    while (n >= value) {
      s += letters;
      n -= value;
    }
  }
  return s;
}

/** One stage of an `SrsSystem`. Names and buckets are set by `finish`. */
export class SrsStage {
  name = '';
  shortName = '';
  nameLetter = '';
  advancedSearchTag = '';
  passedIndex = 0;
  prePassedIndex = 0;
  levelProgressBucket = 0;
  post60DeepBucket = 0;
  post60ShallowBucket = 0;
  srsBreakdownBucket = 0;
  timeLineBarChartBucket = 0;
  generalStageBucket = 0;

  constructor(
    readonly system: SrsSystem,
    readonly id: number,
    /** ms until the next review after reaching this stage; 0 for Locked, Initiate and Burned. */
    readonly interval: number,
  ) {}

  get isLocked(): boolean {
    return this.id === LOCKED_STAGE_ID;
  }

  get isInitial(): boolean {
    return this.id === this.system.initialStageId;
  }

  get isCompleted(): boolean {
    return this.id === this.system.completedStageId;
  }

  get isPassed(): boolean {
    return this.id >= this.system.passedStageId;
  }

  get isEnlightened(): boolean {
    return this.id === this.system.enlightenedStageId;
  }

  get isMaster(): boolean {
    return this.id === this.system.masterStageId;
  }

  /**
   * The stage after a review with `numIncorrect` wrong answers (meaning and
   * reading together). Correct moves up one; otherwise down `ceil(n/2)` stages, twice that from a
   * passed stage; clamped to [first started stage, burned]. Works on list positions, so Locked
   * (-999) and Initiate count as stages below the first started one.
   */
  getNewStage(numIncorrect: number): SrsStage {
    const stages = this.system.stages;
    let index = stages.indexOf(this);
    if (numIncorrect === 0) {
      index++;
    } else {
      const drop = Math.trunc((numIncorrect + 1) / 2);
      index -= drop;
      if (this.isPassed) {
        index -= drop;
      }
    }
    const first = this.system.firstStartedStage;
    if (index < stages.indexOf(first)) {
      return first;
    }
    const completed = this.system.completedStage;
    if (index > stages.indexOf(completed)) {
      return completed;
    }
    return stages[index]!;
  }

  /** Locked < Initiate < Apprentice… < Guru… < Master < Enlightened < Burned. */
  compareTo(o: SrsStage): number {
    if (this.isLocked) return o.isLocked ? 0 : -1;
    if (o.isLocked) return 1;
    if (this.isInitial) return o.isInitial ? 0 : -1;
    if (o.isInitial) return 1;
    if (this.isCompleted) return o.isCompleted ? 0 : 1;
    if (o.isCompleted) return -1;
    if (this.isEnlightened) return o.isEnlightened ? 0 : 1;
    if (o.isEnlightened) return -1;
    if (this.isMaster) return o.isMaster ? 0 : 1;
    if (o.isMaster) return -1;
    if (this.isPassed) {
      return o.isPassed ? Math.sign(this.passedIndex - o.passedIndex) : 1;
    }
    if (o.isPassed) return -1;
    return Math.sign(this.prePassedIndex - o.prePassedIndex);
  }

  /** `findLevelProgressBucket`: 0 passed, 1..7 apprentice (7 = first), 8 initiate, 9 locked. */
  findLevelProgressBucket(): number {
    if (this.isLocked) return 9;
    if (this.isInitial) return 8;
    if (this.isPassed) return 0;
    const i = this.prePassedIndex;
    switch (this.system.numPrePassedStages) {
      case 0:
      case 1:
        return 1;
      case 2:
        return i === 0 ? 7 : 1;
      case 3:
        return [7, 4][i] ?? 1;
      case 4:
        return [7, 5, 3][i] ?? 1;
      case 5:
        return [7, 5, 3, 2][i] ?? 1;
      case 6:
        return [7, 5, 4, 3, 2][i] ?? 1;
      default:
        return [7, 6, 5, 4, 3, 2][i] ?? 1;
    }
  }

  findPost60DeepBucket(): number {
    if (this.isLocked) return 0;
    if (this.isInitial) return 1;
    if (this.isCompleted) return 10;
    if (this.isEnlightened) return 9;
    if (this.isMaster) return 8;
    if (this.isPassed) return Math.min(this.passedIndex, 1) + 6;
    return Math.min(this.prePassedIndex, 3) + 2;
  }

  findPost60ShallowBucket(): number {
    return this.findGeneralStageBucket();
  }

  findSrsBreakdownBucket(): number {
    if (this.isLocked) return -1;
    if (this.isInitial) return 0;
    if (this.isCompleted) return 4;
    if (this.isEnlightened) return 3;
    if (this.isMaster) return 2;
    if (this.isPassed) return 1;
    return 0;
  }

  findTimeLineBarChartBucket(): number {
    if (this.isLocked || this.isInitial) return 0;
    if (this.isCompleted) return 4;
    if (this.isEnlightened) return 3;
    if (this.isMaster) return 2;
    if (this.isPassed) return 1;
    return 0;
  }

  /** `findGeneralStageBucket` (and `findPost60ShallowBucket`, which is identical). */
  findGeneralStageBucket(): number {
    if (this.isLocked) return 0;
    if (this.isInitial) return 1;
    if (this.isCompleted) return 6;
    if (this.isEnlightened) return 5;
    if (this.isMaster) return 4;
    if (this.isPassed) return 3;
    return 2;
  }
}

/**
 * An SRS system: stages by id, with the four special stage ids. Build with `addStage` calls in
 * any order, then `finish()`, which sorts the stages and names them (Apprentice I…, Guru I…, Master,
 * Enlightened, Burned).
 */
export class SrsSystem {
  readonly stages: SrsStage[] = [];
  enlightenedStageId = -1;
  masterStageId = -1;
  numPrePassedStages = 0;
  numPassedStages = 0;

  constructor(
    readonly id: number,
    readonly name: string,
    readonly initialStageId: number,
    readonly startingStageId: number,
    readonly passedStageId: number,
    readonly completedStageId: number,
  ) {
    this.stages.push(new SrsStage(this, LOCKED_STAGE_ID, 0));
  }

  addStage(stageId: number, interval: number): void {
    this.stages.push(new SrsStage(this, stageId, interval));
  }

  /** `getStage`: the stage with that id, else the first (Locked). */
  getStage(stageId: number): SrsStage {
    return this.stages.find((s) => s.id === stageId) ?? this.stages[0]!;
  }

  get lockedStage(): SrsStage {
    return this.getStage(LOCKED_STAGE_ID);
  }

  get initialStage(): SrsStage {
    return this.getStage(this.initialStageId);
  }

  get firstStartedStage(): SrsStage {
    return this.getStage(this.startingStageId);
  }

  get completedStage(): SrsStage {
    return this.getStage(this.completedStageId);
  }

  finish(): void {
    this.stages.sort((a, b) => a.id - b.id);
    this.numPassedStages = 0;
    this.numPrePassedStages = 0;
    for (const stage of this.stages) {
      if (stage.isLocked) {
        Object.assign(stage, { name: 'Locked', shortName: '', nameLetter: 'L', advancedSearchTag: 'locked' });
        stage.passedIndex = -1;
        stage.prePassedIndex = -1;
      } else if (stage.isInitial) {
        Object.assign(stage, { name: 'Initiate', shortName: 'Initiate', nameLetter: 'I', advancedSearchTag: 'initial' });
        stage.passedIndex = -1;
        stage.prePassedIndex = -1;
      } else if (stage.isCompleted) {
        Object.assign(stage, { name: 'Burned', shortName: 'Burned', nameLetter: 'B', advancedSearchTag: 'burned' });
        stage.passedIndex = -1;
        stage.prePassedIndex = -1;
      } else if (stage.isPassed) {
        stage.name = 'Guru ' + romanNumeral(this.numPassedStages + 1);
        stage.shortName = stage.name;
        stage.nameLetter = 'G';
        stage.advancedSearchTag = 'pass:' + this.numPassedStages;
        stage.passedIndex = this.numPassedStages;
        stage.prePassedIndex = -1;
        this.numPassedStages++;
      } else {
        stage.name = 'Apprentice ' + romanNumeral(this.numPrePassedStages + 1);
        stage.shortName = 'Appr ' + romanNumeral(this.numPrePassedStages + 1);
        stage.nameLetter = 'A';
        stage.advancedSearchTag = 'prepass:' + this.numPrePassedStages;
        stage.passedIndex = -1;
        stage.prePassedIndex = this.numPrePassedStages;
        this.numPrePassedStages++;
      }
    }
    let enlightenedFound = false;
    let masterFound = false;
    for (let i = this.stages.length - 1; i >= 0; i--) {
      const stage = this.stages[i]!;
      if (stage.isCompleted || !stage.isPassed) {
        continue;
      }
      if (!enlightenedFound) {
        enlightenedFound = true;
        Object.assign(stage, { name: 'Enlightened', shortName: 'Enl', nameLetter: 'E', advancedSearchTag: 'enlightened' });
        this.enlightenedStageId = stage.id;
      } else if (!masterFound) {
        masterFound = true;
        Object.assign(stage, { name: 'Master', shortName: 'Master', nameLetter: 'M', advancedSearchTag: 'master' });
        this.masterStageId = stage.id;
      }
    }
    for (const stage of this.stages) {
      stage.levelProgressBucket = stage.findLevelProgressBucket();
      stage.post60DeepBucket = stage.findPost60DeepBucket();
      stage.post60ShallowBucket = stage.findPost60ShallowBucket();
      stage.srsBreakdownBucket = stage.findSrsBreakdownBucket();
      stage.timeLineBarChartBucket = stage.findTimeLineBarChartBucket();
      stage.generalStageBucket = stage.findGeneralStageBucket();
    }
  }
}

/** ms per `interval_unit`; unknown or missing units are seconds. */
function intervalUnit(unit: string | null | undefined): number {
  switch (unit) {
    case 'milliseconds':
      return 1;
    case 'minutes':
      return MINUTE;
    case 'hours':
      return HOUR;
    case 'days':
      return DAY;
    case 'weeks':
      return WEEK;
    default:
      return SECOND;
  }
}

/** An `SrsSystem` from a content row. */
export function srsSystemFromData(data: SrsSystemData): SrsSystem {
  const system = new SrsSystem(data.id, data.name, data.unlockingStagePosition,
    data.startingStagePosition, data.passingStagePosition, data.burningStagePosition);
  for (const stage of data.stages) {
    system.addStage(stage.position, (stage.interval ?? 0) * intervalUnit(stage.interval_unit));
  }
  system.finish();
  return system;
}

function classic(id: number, name: string, intervals: readonly number[]): SrsSystem {
  const system = new SrsSystem(id, name, 0, 1, 5, 9);
  intervals.forEach((interval, stageId) => system.addStage(stageId, interval));
  system.finish();
  return system;
}

/**
 * The built-in systems used when the DB has none. Same stages and
 * intervals as the content DB's `srs_system` rows 1 and 2 (only the names differ).
 */
export function fallbackSrsSystems(): readonly SrsSystem[] {
  fallback ??= buildFallback();
  return fallback;
}

let fallback: readonly SrsSystem[] | null = null;

function buildFallback(): readonly SrsSystem[] {
  const tail = [601200000, 1206000000, 2588400000, 10364400000, 0];
  return [
    classic(1, 'Classic', [0, 14400000, 28800000, 82800000, 169200000, ...tail]),
    classic(2, 'Classic accelerated', [0, 7200000, 14400000, 28800000, 82800000, ...tail]),
  ];
}

/** The system with that id, else the first fallback system. */
export function findSrsSystem(systems: readonly SrsSystem[], id: number): SrsSystem {
  return systems.find((s) => s.id === id) ?? fallbackSrsSystems()[0]!;
}
