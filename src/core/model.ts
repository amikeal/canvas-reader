// Normalized course model. Everything the renderer needs, nothing Canvas-specific
// about how it was stored. HTML fields are raw (unsanitized, tokens unresolved);
// the site builder rewrites and sanitizes them at render time.

export interface Course {
  id: string;
  title: string;
  courseCode?: string;
  startAt?: string;
  endAt?: string;
  /** Canvas home page setting: wiki | modules | assignments | syllabus | feed */
  defaultView: string;
  /** IANA zone used to display dates (best effort, see dates.ts). */
  timeZone: string;
  exportedAt?: string;
  syllabusHtml?: string;
  tabs: Tab[];
  modules: Module[];
  pages: Page[];
  assignments: Assignment[];
  assignmentGroups: AssignmentGroup[];
  discussions: Discussion[];
  quizzes: Quiz[];
  questionBanks: QuestionBank[];
  files: FileEntry[];
  webLinks: WebLink[];
  ltiLinks: LtiLink[];
  gradingStandards: GradingStandard[];
  warnings: string[];
}

export type TabKind =
  | 'home'
  | 'announcements'
  | 'syllabus'
  | 'modules'
  | 'assignments'
  | 'discussions'
  | 'pages'
  | 'files'
  | 'quizzes';

export interface Tab {
  kind: TabKind;
  label: string;
  hidden: boolean;
}

export interface Module {
  id: string;
  title: string;
  position: number;
  published: boolean;
  unlockAt?: string;
  requireSequential: boolean;
  items: ModuleItem[];
}

export type ModuleItemType =
  | 'WikiPage'
  | 'Assignment'
  | 'Attachment'
  | 'ExternalUrl'
  | 'ContextExternalTool'
  | 'DiscussionTopic'
  | 'Quizzes::Quiz'
  | 'ContextModuleSubHeader'
  | (string & {});

export interface ModuleItem {
  id: string;
  type: ModuleItemType;
  title: string;
  /** Manifest resource identifier this item points at. */
  ref?: string;
  url?: string;
  indent: number;
  newTab: boolean;
  published: boolean;
}

export interface Page {
  id: string;
  /** Manifest resource identifier (usually equal to id). */
  resourceId: string;
  slug: string;
  title: string;
  html: string;
  published: boolean;
  frontPage: boolean;
}

export interface AssignmentGroup {
  id: string;
  title: string;
  position: number;
  weight?: number;
}

export interface Assignment {
  id: string;
  title: string;
  html: string;
  dueAt?: string;
  unlockAt?: string;
  lockAt?: string;
  allDay: boolean;
  timeZone?: string;
  points?: number;
  gradingType?: string;
  submissionTypes: string[];
  allowedExtensions: string[];
  groupId?: string;
  position?: number;
  published: boolean;
  quizId?: string;
  discussionId?: string;
  externalToolUrl?: string;
  peerReviews: boolean;
}

export interface Discussion {
  id: string;
  title: string;
  html: string;
  isAnnouncement: boolean;
  postedAt?: string;
  delayedPostAt?: string;
  position?: number;
  published: boolean;
  /** Graded discussions carry an embedded assignment. */
  assignment?: Assignment;
}

export interface Quiz {
  id: string;
  title: string;
  html: string;
  quizType?: string;
  points?: number;
  timeLimit?: number;
  allowedAttempts?: number;
  dueAt?: string;
  unlockAt?: string;
  lockAt?: string;
  published: boolean;
  shuffleAnswers?: boolean;
  questions: QuizEntry[];
  assignmentId?: string;
  /** Graded quizzes embed their assignment (group, publish state, time zone). */
  assignment?: Assignment;
}

/** A quiz is a sequence of questions and question groups. */
export type QuizEntry = { kind: 'question'; question: Question } | { kind: 'group'; group: QuestionGroup };

export interface QuestionGroup {
  id: string;
  title: string;
  pick?: number;
  pointsPerItem?: number;
  /** Bank the group draws from, if any (manifest/bank identifier). */
  bankRef?: string;
  questions: Question[];
}

export interface QuestionBank {
  id: string;
  title: string;
  questions: Question[];
}

export interface Question {
  id: string;
  title: string;
  type: string;
  points?: number;
  html: string;
  responses: QResponse[];
  feedback: { general?: string; correct?: string; incorrect?: string };
}

export interface QResponse {
  id: string;
  /** Matching left-hand side, or blank/dropdown variable name. */
  label?: string;
  kind: 'choice' | 'text';
  multiple: boolean;
  choices: { id: string; html: string; correct: boolean }[];
  /** Accepted answers for free-text/numeric responses. */
  accepted: string[];
}

export interface FileEntry {
  /** Manifest resource identifier, if the file is a resource. */
  id?: string;
  /** Path relative to web_resources/, e.g. "course_image/x.jpg". */
  path: string;
  archivePath: string;
  size: number;
  hidden: boolean;
}

export interface WebLink {
  id: string;
  title: string;
  url: string;
}

export interface LtiLink {
  id: string;
  title: string;
  description?: string;
  launchUrl?: string;
  resourceLinkUrl?: string;
}

export interface GradingStandard {
  id: string;
  title: string;
  /** [letter, minimum fraction] pairs, descending. */
  scheme: [string, number][];
  pointsBased: boolean;
}
