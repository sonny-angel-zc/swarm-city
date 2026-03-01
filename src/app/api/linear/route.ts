import { NextRequest, NextResponse } from 'next/server';

const LINEAR_API = 'https://api.linear.app/graphql';
const API_KEY = process.env.LINEAR_API_KEY ?? '';

async function linearQuery(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: `Linear API ${res.status}: ${text}` };
  }
  return res.json();
}

const QUERIES = {
  list: `query($teamId: String!) {
    team(id: $teamId) {
      issues(first: 100, orderBy: updatedAt) {
        nodes {
          id identifier title description priority priorityLabel
          state { name type }
          assignee { name }
          url
          createdAt updatedAt
          labels { nodes { name color } }
        }
      }
    }
  }`,
  create: `mutation($teamId: String!, $title: String!, $description: String, $priority: Int, $stateId: String) {
    issueCreate(input: { teamId: $teamId, title: $title, description: $description, priority: $priority, stateId: $stateId }) {
      success
      issue { id identifier title url state { name type } priority }
    }
  }`,
  updateStatus: `mutation($issueId: String!, $stateId: String!) {
    issueUpdate(id: $issueId, input: { stateId: $stateId }) {
      success
      issue { id identifier state { name type } }
    }
  }`,
  states: `query($teamId: String!) {
    team(id: $teamId) {
      states { nodes { id name type position } }
    }
  }`,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, teamId, title, description, priority, issueId, stateId } = body;

    switch (action) {
      case 'list':
        return NextResponse.json(await linearQuery(QUERIES.list, { teamId }));
      case 'create':
        return NextResponse.json(
          await linearQuery(QUERIES.create, { teamId, title, description, priority, stateId }),
        );
      case 'updateStatus':
        return NextResponse.json(
          await linearQuery(QUERIES.updateStatus, { issueId, stateId }),
        );
      case 'states':
        return NextResponse.json(await linearQuery(QUERIES.states, { teamId }));
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
