import { QueryFunctionContext } from "@tanstack/react-query";
import axios from "axios";
import {
  CompatibleError,
  createQuery,
  CreateQueryOptions,
  Fetcher,
  QueryHook,
} from "react-query-kit";

const authenticatedFetch = async <TFnData, TVariables = void>(
  variables: TVariables,
  context: QueryFunctionContext,
  fetcher: Fetcher<TFnData, TVariables, never>,
): Promise<TFnData | { unauthenticated: true }> => {
  try {
    const result = await fetcher(variables, context);
    return result;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        return { unauthenticated: true };
      }
    }

    throw error;
  }
};

export const createAuthenticatedQuery = <
  TFnData,
  TVariables = void,
  TError = CompatibleError,
>(
  options: CreateQueryOptions<
    TFnData | { unauthenticated: true },
    TVariables,
    TError
  >,
): QueryHook<TFnData | { unauthenticated: true }, TVariables, TError> => {
  return createQuery({
    ...options,
    fetcher: (variables, context) =>
      authenticatedFetch(variables, context, options.fetcher),
  });
};
