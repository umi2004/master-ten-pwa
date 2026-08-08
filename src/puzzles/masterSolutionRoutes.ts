import { indexToPosition, type GameMove } from '../core';

export interface MasterSolutionRoute {
  readonly routeId: string;
  readonly solutionPrefix: string;
  readonly encodedMoves: string;
  readonly moves: readonly GameMove[];
}

interface EncodedMasterSolutionRoute {
  readonly routeId: string;
  readonly solutionPrefix: string;
  readonly encodedMoves: string;
}

const ENCODED_MASTER_SOLUTION_ROUTES: readonly EncodedMasterSolutionRoute[] = [
  {
    routeId: 'master_v8_158_79622587',
    solutionPrefix: '8-9,1-11,4-12,28-38,3-19,5-15,35-36,6-24,A,37-46,40-48,55-64',
    encodedMoves: '8.9,1.b,4.c,s.12,3.j,5.f,z.10,6.o,A,11.1a,14.1c,1j.1s,1n.1v,17.1g,1l.1t,1b.1k,1h.1q,15.1d,18.1o,v.1f,1i.1m,1e.1u,r.19,i.1i,A,1u.22,1r.20,1n.1v,1h.1p,1g.1q,13.1b,1a.1c,n.1j,1k.1s,19.1d,1f.1n,e.w,l.1f,A,0.1i,16.1m,17.1h,t.1n,m.1m,1a.1j,1g.1i,y.18,A,k.p,1f.1o,u.1y,1j.1t,a.1s,7.d,1k.1u,1m.1v,1c.1w,1p.1z,1h.1x,q.1q,h.x,w.12,u.17,t.13,w.10,A,2.12,7.y,6.o,a.c,9.d,0.e',
  },
  {
    routeId: 'master_v8_074_79622583',
    solutionPrefix: '3-4,35-36,28-38,1-11,8-9,5-15,6-24,A,52-61,60-68,55-64,56-65',
    encodedMoves: '3.4,z.10,s.12,1.b,8.9,5.f,6.o,A,1g.1p,1o.1w,1j.1s,1k.1t,1b.1l,14.1d,r.19,1n.1v,u.1a,15.1e,1h.1q,1m.1r,w.1c,16.1u,A,n.25,1x.26,23.2d,29.2j,1f.2f,22.2b,1v.25,v.2d,1y.2e,1t.1z,2c.2f,1p.27,19.1q,11.19,m.1a,e.1a,i.1c,h.j,A,d.1v,1x.26,1q.1z,x.1t,t.y,l.1p,g.1s,q.y,A,7.p,c.1g,u.1y,k.z,a.q,2.i,j.11,v.14,l.15,9.n,l.o,s.10,t.11,9.13,x.16,A,w.16,y.18,q.1e,p.r,h.15,v.z,14.17,1a.1j,1c.1k,12.1m,e.18,i.12,k.10,0.10,m.o,c.p,2.c,3.e',
  },
  {
    routeId: 'master_v8_222_79482523',
    solutionPrefix: '28-38,3-4,1-11,5-15,6-24,35-36,8-9,A,61-69,51-60,50-52,55-64',
    encodedMoves: 's.12,3.4,1.b,5.f,6.o,z.10,8.9,A,1p.1x,1f.1o,1e.1g,1j.1s,18.1h,r.19,1c.1m,1i.1r,1n.1v,11.1b,14.1k,16.1q,u.1a,1l.1u,1d.1k,y.1e,x.13,A,1a.1j,1b.1l,1i.1s,v.1d,1f.1p,19.1r,1e.1o,1k.1t,1h.1m,1c.1g,18.1h,k.1e,A,1f.1o,1g.1q,19.1j,18.1a,17.1n,1b.1k,n.1h,1d.1m,A,e.w,m.1v,q.1e,15.1c,c.10,2.1g,0.7,k.u,p.r,4.o,c.k,g.j,7.y,r.10,q.s,a.11,n.t,u.12,x.z,A,8.18,9.19,u.14,m.12,c.n,d.n,e.f,1.g,1.3,6.7',
  },
  {
    routeId: 'master_v8_054_79622583',
    solutionPrefix: '28-38,3-4,1-11,5-15,6-24,35-36,8-9,A,37-47,29-56,53-62,40-49',
    encodedMoves: 's.12,3.4,1.b,5.f,6.o,z.10,8.9,A,11.1b,t.1k,1h.1q,14.1d,1p.1x,1f.1o,u.1a,1i.1r,1n.1v,1c.1m,r.19,15.1e,i.1w,1j.1s,1l.1u,h.j,A,1v.23,1r.20,1s.22,18.1q,1n.1x,1m.1u,1g.1p,a.1s,1c.1k,v.1v,16.1q,x.1f,1b.1n,1g.1n,0.k,q.w,A,1n.1x,1h.1q,1l.1v,1j.1r,1m.1u,A,m.24,c.1g,7.d,2.e,p.1t,c.10,7.e,7.1j,o.x,f.16,s.u,w.y,z.18,A,12.1c,10.13,16.1f,19.1i,1b.1k,1a.1d,17.1e,1h.1j,n.1r,1g.1l,q.1e,p.r,b.v,g.17,3.b,7.n,d.f,1.h',
  },
  {
    routeId: 'master_v8_142_79622583',
    solutionPrefix: '28-38,8-9,5-15,4-12,6-24,35-36,1-11,A,56-65,46-55,3-19,57-66',
    encodedMoves: 's.12,8.9,5.f,4.c,6.o,z.10,1.b,A,1k.1t,1a.1j,3.j,1l.1u,1s.1v,1g.1p,1i.1m,1f.1o,15.1e,11.19,14.1d,w.1c,1b.1h,18.1o,A,i.1w,1x.26,1u.24,1z.27,1y.2e,23.2c,13.1r,1v.25,t.1n,17.1p,1q.1s,v.2d,1i.22,16.1o,1j.1s,1i.1q,1b.1k,x.15,A,1h.1p,a.1j,7.d,r.19,1f.1z,2.e,1q.1y,1n.1v,A,0.k,e.1i,p.1d,g.17,z.10,t.11,l.19,c.l,o.x,7.n,d.l,h.k,h.q,g.j,8.g,4.e,5.f,9.a,2.i,b.c,3.j,A,6.d,7.f,d.e,c.g,b.h,8.9',
  },
] as const;

export function decodeMasterSolution(encodedMoves: string): readonly GameMove[] {
  return encodedMoves.split(',').map((encoded): GameMove => {
    if (encoded === 'A') return { type: 'ADD_NUMBERS' };
    const [firstValue, secondValue] = encoded.split('.');
    const first = Number.parseInt(firstValue ?? '', 36);
    const second = Number.parseInt(secondValue ?? '', 36);
    if (!Number.isInteger(first) || !Number.isInteger(second)) {
      throw new Error(`Invalid encoded MASTER solution move: ${encoded}`);
    }
    return {
      type: 'PAIR',
      first: indexToPosition(first),
      second: indexToPosition(second),
    };
  });
}

export function encodeMasterSolution(moves: readonly GameMove[]): string {
  return moves.map((move) => {
    if (move.type === 'ADD_NUMBERS') return 'A';
    const first = move.first.row * 9 + move.first.column;
    const second = move.second.row * 9 + move.second.column;
    return `${first.toString(36)}.${second.toString(36)}`;
  }).join(',');
}

export const MASTER_SOLUTION_ROUTES: readonly MasterSolutionRoute[] =
  ENCODED_MASTER_SOLUTION_ROUTES.map((route) => ({
    ...route,
    moves: decodeMasterSolution(route.encodedMoves),
  }));

export function masterSolutionRouteForPrefix(prefix: string): MasterSolutionRoute | undefined {
  return MASTER_SOLUTION_ROUTES.find((route) => route.solutionPrefix === prefix);
}
