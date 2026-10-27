export type View = { id: string; path: string; width: number; height: number; landmark: string; reference?: string };
export type Project = {
  id: string;
  root: string;
  dev: string[];
  build: string[];
  typecheck: string[];
  allowedCss: string[];
  target: View;
  protected: View[];
};
export type ElementEvidence = { id: string; tag: string; text: string; classes: string; box: Box; css: Record<string,string> };
export type Box = { x: number; y: number; width: number; height: number };
export type Capture = { image: string; elements: ElementEvidence[]; errors: string[]; overflow: boolean; landmark?: Box };
export type Proposal = { file: string; selector: string; property: string; expectedValue: string; newValue: string; reason: string; evidenceId: string };
export type Candidate = { proposal: Proposal; diff: string; targetBefore: number; targetAfter: number; protected: {id:string; changedRatio:number; landmarkDelta:number; overflow:boolean; errors:string[]}[]; checks: Record<string,boolean>; verdict: 'accepted'|'rejected'; reasons: string[]; artifacts: Record<string,string> };
export type Run = { id: string; projectId: string; state: 'running'|'review'|'failed'|'applied'; startedAt: string; endedAt?: string; baseCommit: string; events: {at:string; message:string}[]; candidates: Candidate[]; model: {provider:string; id:string; calls:number; inputTokens:number; outputTokens:number; costUsd:number; latencyMs:number[]}; error?: string };
