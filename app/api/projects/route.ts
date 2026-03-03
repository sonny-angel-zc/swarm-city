import { NextResponse } from 'next/server';
import { LINEAR_TEAM_ID, listLinearProjects } from '@/core/linearServer';

type ApiProject = {
  id: string;
  name: string;
  description: string | null;
  state: string | null;
  issueBreakdown: {
    todo: number;
    inProgress: number;
    done: number;
  };
  progressPercentage: number;
  totalIssues: number;
};

function toProgressPercentage(doneIssues: number, totalIssues: number): number {
  if (totalIssues <= 0) return 0;
  const value = (doneIssues / totalIssues) * 100;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function GET() {
  try {
    const projects = await listLinearProjects(LINEAR_TEAM_ID);
    const payload: ApiProject[] = projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      state: project.state,
      issueBreakdown: {
        todo: project.issueBreakdown.todo,
        inProgress: project.issueBreakdown.in_progress,
        done: project.issueBreakdown.done,
      },
      progressPercentage: toProgressPercentage(project.doneIssues, project.totalIssues),
      totalIssues: project.totalIssues,
    }));

    return NextResponse.json({ projects: payload }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load projects' },
      { status: 500 },
    );
  }
}
