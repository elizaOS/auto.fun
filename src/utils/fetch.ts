import { ZodSchema, ZodTypeDef } from "zod";
// eslint-disable-next-line no-restricted-imports
import axios, { AxiosResponse } from "axios";
import { CONTRACT_API_URL } from "./env";

type WomboApiOptionsWithoutBody<TSchema, T1 extends ZodTypeDef, T2> = {
  endpoint: string;
  /**
   * a zod schema to be used to parse/validate the response
   */
  schema?: ZodSchema<TSchema, T1, T2>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WomboApiOptions<
  TSchema,
  T1 extends ZodTypeDef,
  T2,
> = WomboApiOptionsWithoutBody<TSchema, T1, T2> & { body?: unknown };

type AxiosWrapperOptions<TSchema, T1 extends ZodTypeDef, T2> = WomboApiOptions<
  TSchema,
  T1,
  T2
> & { method: string };

const axiosInstance = axios.create({
  baseURL: CONTRACT_API_URL,
  responseType: "json",
});

const axiosWrapper = async <TSchema, T1 extends ZodTypeDef, T2>({
  endpoint,
  body,
  schema,
  method,
}: AxiosWrapperOptions<TSchema, T1, T2>) => {
  try {
    const response = await axiosInstance.request<
      unknown,
      AxiosResponse<TSchema>
    >({
      url: endpoint,
      method,
      data: body,
      headers: {
        // 'x-app-version': app.getVersion(),
      },
    });

    if (!schema) {
      return response.data;
    }

    const parsedData = await schema.safeParseAsync(response.data);

    if (!parsedData.success) {
      const fieldErrors = JSON.stringify(parsedData.error.issues, null, 2);
      console.error(
        `failed validation on response body: ${JSON.stringify(response.data, null, 2)}`,
      );
      console.error(`errors: ${fieldErrors}`);

      throw new Error(
        `endpoint '${endpoint}' failed with schema validation errors: ${fieldErrors}`,
      );
    }

    return parsedData.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        "request failed:",
        JSON.stringify(
          {
            status: error.response?.status,
            url: endpoint,
            requestBody: body,
            responseBody: error.response?.data,
            method,
          },
          null,
          2,
        ),
      );
    } else {
      console.error("Non-axios error thrown in fetch service:", error);
    }

    throw error;
  }
};

export const womboApi = {
  get: <TSchema, T1 extends ZodTypeDef, T2>(
    options: WomboApiOptionsWithoutBody<TSchema, T1, T2>,
  ) => axiosWrapper({ ...options, method: "get" }),
  delete: <TSchema, T1 extends ZodTypeDef, T2>(
    options: WomboApiOptionsWithoutBody<TSchema, T1, T2>,
  ) => axiosWrapper({ ...options, method: "delete" }),
  post: <TSchema, T1 extends ZodTypeDef, T2>(
    options: WomboApiOptions<TSchema, T1, T2>,
  ) => axiosWrapper({ ...options, method: "post" }),
  put: <TSchema, T1 extends ZodTypeDef, T2>(
    options: WomboApiOptions<TSchema, T1, T2>,
  ) => axiosWrapper({ ...options, method: "put" }),
  patch: <TSchema, T1 extends ZodTypeDef, T2>(
    options: WomboApiOptions<TSchema, T1, T2>,
  ) => axiosWrapper({ ...options, method: "patch" }),
};
