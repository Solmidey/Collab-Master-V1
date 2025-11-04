export type PreparedCallback<TParams extends unknown[], TResult> = (
  ...params: TParams
) => TResult;

export class PreparedStatement<TParams extends unknown[], TResult> {
  constructor(private readonly callback: PreparedCallback<TParams, TResult>) {}

  run(...params: TParams): TResult {
    return this.callback(...params);
  }
}

export class InMemoryDatabase {
  prepare<TParams extends unknown[], TResult>(
    _statement: string,
    callback: PreparedCallback<TParams, TResult>
  ): PreparedStatement<TParams, TResult> {
    return new PreparedStatement(callback);
  }
}
