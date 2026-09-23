export type ArrivalRow = {
  finishingPosition: number;
  pmuNumber: number;
  deadHeatGroup: number;
};

export function expandArrivalOrder(order: number[][]): ArrivalRow[] {
  const rows: ArrivalRow[] = [];
  let finishingPosition = 1;
  for (const group of order) {
    const deadHeatGroup = group.length > 1 ? finishingPosition : 0;
    for (const pmuNumber of group) rows.push({ finishingPosition, pmuNumber, deadHeatGroup });
    finishingPosition += group.length;
  }
  return rows;
}
