import { createMutation, createQuery } from "react-query-kit";
import { womboApi } from "./fetch";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";

const CommentSchema = z.object({
  author: z.string(),
  timestamp: z.string(),
  likes: z.number(),
  message: z.string(),
  _id: z.string(),
  replyCount: z.number(),
});

type CreateComment = Pick<z.infer<typeof CommentSchema>, "message"> & {
  parentId?: string;
};

export const useComments = createQuery({
  queryKey: ["comments"],
  fetcher: async (mint: string) => {
    const token = await womboApi.get({
      endpoint: `/messages/${mint}`,
      schema: CommentSchema.array(),
    });

    return token;
  },
});

export const useCommentReplies = createQuery({
  queryKey: ["comment-replies"],
  fetcher: async (id: string) => {
    const replies = await womboApi.get({
      endpoint: `/messages/${id}/replies`,
      schema: CommentSchema.array(),
    });

    return replies;
  },
});

export const useCreateComment = createMutation({
  mutationKey: ["create-comment"],
  mutationFn: async ({
    mint,
    comment,
  }: {
    mint: string;
    comment: CreateComment;
  }) => {
    const response = await womboApi.post({
      endpoint: `/messages/${mint}`,
      body: comment,
      schema: CommentSchema,
    });

    return response;
  },
  use: [
    (useMutationNext) => (options) => {
      const queryClient = useQueryClient();

      return useMutationNext({
        ...options,
        onSuccess: (newComment, { mint, comment }) => {
          if (comment.parentId) {
            // Update replies cache
            queryClient.setQueryData(
              ["comment-replies", comment.parentId],
              (old: z.infer<typeof CommentSchema>[] = []) => [
                ...old,
                newComment,
              ],
            );

            // Update reply count in parent comment
            queryClient.setQueryData(
              ["comments", mint],
              (old: z.infer<typeof CommentSchema>[] = []) =>
                old.map((c) =>
                  c._id === comment.parentId
                    ? { ...c, replyCount: c.replyCount + 1 }
                    : c,
                ),
            );

            queryClient.invalidateQueries({
              queryKey: ["comments", mint],
            });
          } else {
            // Update main comments list for top-level comments
            queryClient.setQueryData(
              ["comments", mint],
              (old: z.infer<typeof CommentSchema>[] = []) => [
                ...old,
                newComment,
              ],
            );
          }
        },
      });
    },
  ],
});
