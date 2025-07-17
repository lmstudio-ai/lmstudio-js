export class IdGiver {
  private nextId: number;
  public constructor(firstId: number = 0) {
    this.nextId = firstId;
  }
  public next(): number {
    const id = this.nextId;
    this.nextId++;
    return id;
  }
}
