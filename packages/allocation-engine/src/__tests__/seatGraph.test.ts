import { describe, expect, it } from 'vitest';
import { SeatGraph } from '../graph/seatGraph.js';
import { makeIrregularRoom } from './helpers.js';

describe('SeatGraph on irregular rooms', () => {
  // Row1: 10 seats, Row2: 8 seats, Row3: 10 seats — no rectangular assumption.
  const room = makeIrregularRoom('R1', [10, 8, 10]);
  const graph = new SeatGraph(room);
  const seatAt = (row: number, col: number) => room.seats.find((s) => s.row === row && s.col === col)!;

  it('computes horizontal neighbors within a row', () => {
    const seat = seatAt(1, 5);
    const { horizontal } = graph.neighborsOf(seat);
    expect(horizontal.map((s) => s.col).sort()).toEqual([4, 6]);
  });

  it('has no horizontal neighbor past the row edge', () => {
    const seat = seatAt(2, 8);
    const { horizontal } = graph.neighborsOf(seat);
    expect(horizontal.map((s) => s.col)).toEqual([7]);
  });

  it('finds no vertical neighbor when the adjacent row is shorter (col does not exist)', () => {
    const seat = seatAt(1, 9); // row 2 only has 8 seats, so col 9 doesn't exist there
    const { vertical } = graph.neighborsOf(seat);
    expect(vertical.length).toBe(0);
  });

  it('finds a vertical neighbor when the column exists in the adjacent row', () => {
    const seat = seatAt(1, 3);
    const { vertical } = graph.neighborsOf(seat);
    expect(vertical.map((s) => `${s.row}:${s.col}`)).toEqual(['2:3']);
  });

  it('computes diagonal neighbors correctly across irregular rows', () => {
    const seat = seatAt(2, 8); // rows 1 and 3 both have 10 seats, so all four diagonals exist
    const { diagonal } = graph.neighborsOf(seat);
    expect(diagonal.map((s) => `${s.row}:${s.col}`).sort()).toEqual(['1:7', '1:9', '3:7', '3:9']);
  });

  it('computes seat distance', () => {
    const a = seatAt(1, 1);
    const b = seatAt(3, 3);
    expect(graph.distance(a, b)).toBe(4);
  });
});
