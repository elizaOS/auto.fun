import { ZodSchema, ZodTypeDef } from "zod";
// eslint-disable-next-line no-restricted-imports
import axios, { AxiosResponse } from "axios";
import { API_URL, CONTRACT_API_URL } from "./env";

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
> & { method: string; api: "wombo" | "contract" | "rawJson" };

const baseAxiosInstance = axios.create({
  baseURL: API_URL,
  responseType: "json",
});

// server cookie support
baseAxiosInstance.defaults.withCredentials = true;

const contractAxiosInstance = axios.create({
  baseURL: CONTRACT_API_URL,
  responseType: "json",
});

const rawJsonAxiosInstance = axios.create({
  responseType: "json",
});

const axiosWrapper = async <TSchema, T1 extends ZodTypeDef, T2>({
  endpoint,
  body,
  schema,
  method,
  api,
}: AxiosWrapperOptions<TSchema, T1, T2>) => {
  try {
    const getAxiosInstance = (api: "wombo" | "contract" | "rawJson") => {
      switch (api) {
        case "contract":
          return contractAxiosInstance;
        case "rawJson":
          return rawJsonAxiosInstance;
        default:
          return baseAxiosInstance;
      }
    };

    const axiosInstance = getAxiosInstance(api);

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
  ) => axiosWrapper({ ...options, method: "get", api: "wombo" }),
  delete: <TSchema, T1 extends ZodTypeDef, T2>(
    options: WomboApiOptionsWithoutBody<TSchema, T1, T2>,
  ) => axiosWrapper({ ...options, method: "delete", api: "wombo" }),
  post: <TSchema, T1 extends ZodTypeDef, T2>(
    options: WomboApiOptions<TSchema, T1, T2>,
  ) => axiosWrapper({ ...options, method: "post", api: "wombo" }),
  put: <TSchema, T1 extends ZodTypeDef, T2>(
    options: WomboApiOptions<TSchema, T1, T2>,
  ) => axiosWrapper({ ...options, method: "put", api: "wombo" }),
  patch: <TSchema, T1 extends ZodTypeDef, T2>(
    options: WomboApiOptions<TSchema, T1, T2>,
  ) => axiosWrapper({ ...options, method: "patch", api: "wombo" }),

  contract: {
    get: <TSchema, T1 extends ZodTypeDef, T2>(
      options: WomboApiOptionsWithoutBody<TSchema, T1, T2>,
    ) => axiosWrapper({ ...options, method: "get", api: "contract" }),
    delete: <TSchema, T1 extends ZodTypeDef, T2>(
      options: WomboApiOptionsWithoutBody<TSchema, T1, T2>,
    ) => axiosWrapper({ ...options, method: "delete", api: "contract" }),
    post: <TSchema, T1 extends ZodTypeDef, T2>(
      options: WomboApiOptions<TSchema, T1, T2>,
    ) => axiosWrapper({ ...options, method: "post", api: "contract" }),
    put: <TSchema, T1 extends ZodTypeDef, T2>(
      options: WomboApiOptions<TSchema, T1, T2>,
    ) => axiosWrapper({ ...options, method: "put", api: "contract" }),
    patch: <TSchema, T1 extends ZodTypeDef, T2>(
      options: WomboApiOptions<TSchema, T1, T2>,
    ) => axiosWrapper({ ...options, method: "patch", api: "contract" }),
  },

  raw: {
    get: <TSchema, T1 extends ZodTypeDef, T2>(
      options: WomboApiOptionsWithoutBody<TSchema, T1, T2>,
    ) => axiosWrapper({ ...options, method: "get", api: "rawJson" }),
    delete: <TSchema, T1 extends ZodTypeDef, T2>(
      options: WomboApiOptionsWithoutBody<TSchema, T1, T2>,
    ) => axiosWrapper({ ...options, method: "delete", api: "rawJson" }),
    post: <TSchema, T1 extends ZodTypeDef, T2>(
      options: WomboApiOptions<TSchema, T1, T2>,
    ) => axiosWrapper({ ...options, method: "post", api: "rawJson" }),
    put: <TSchema, T1 extends ZodTypeDef, T2>(
      options: WomboApiOptions<TSchema, T1, T2>,
    ) => axiosWrapper({ ...options, method: "put", api: "rawJson" }),
    patch: <TSchema, T1 extends ZodTypeDef, T2>(
      options: WomboApiOptions<TSchema, T1, T2>,
    ) => axiosWrapper({ ...options, method: "patch", api: "rawJson" }),
  },
};
