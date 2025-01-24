import { createMutation, createQuery } from "react-query-kit";
import { womboApi } from "./fetch";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/components/providers";

const CommentSchema = z.object({
  author: z.string(),
  timestamp: z.string(),
  likes: z.number(),
  message: z.string(),
  _id: z.string(),
  replyCount: z.number(),
  hasLiked: z.boolean(),
  parentId: z.string().optional(),
});

type CreateComment = Pick<z.infer<typeof CommentSchema>, "message"> & {
  parentId?: string;
};

export type Comment = z.infer<typeof CommentSchema>;

export const useComments = createQuery({
  queryKey: ["comments"],
  fetcher: async (mint: string, { queryKey }) => {
    const newComments = await womboApi.get({
      endpoint: `/messages/${mint}`,
      schema: CommentSchema.array(),
    });

    const existingComments = queryClient.getQueryData(queryKey) as Comment[];
    if (!existingComments) return newComments;

    // use cached hasLiked over the server data since we are
    // optistically updating the data on the client and don't want to
    // overwrite the user's like state
    return newComments.map((comment) => {
      const existing = existingComments.find((c) => c._id === comment._id);
      return existing?.hasLiked ? { ...comment, hasLiked: true } : comment;
    });
  },
});

export const useCommentReplies = createQuery({
  queryKey: ["comment-replies"],
  fetcher: async (id: string) => {
    const newReplies = await womboApi.get({
      endpoint: `/messages/${id}/replies`,
      schema: CommentSchema.array(),
    });

    const existingReplies = queryClient.getQueryData<Comment[]>([
      "comment-replies",
      id,
    ]);
    if (!existingReplies) return newReplies;

    // use cached hasLiked over the server data since we are
    // optistically updating the data on the client and don't want to
    // overwrite the user's like state
    return newReplies.map((reply) => {
      const existing = existingReplies.find((r) => r._id === reply._id);
      return existing?.hasLiked ? { ...reply, hasLiked: true } : reply;
    });
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
                newComment,
                ...old,
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
                newComment,
                ...old,
              ],
            );
          }
        },
      });
    },
  ],
});

export const useLikeComment = createMutation({
  mutationKey: ["like-comment"],
  mutationFn: async ({
    id,
  }: {
    id: string;
    mint: string;
    parentId?: string;
  }) => {
    const response = await womboApi.post({
      endpoint: `/message-likes/${id}`,
    });
    return response;
  },
  use: [
    (useMutationNext) => (options) => {
      const queryClient = useQueryClient();

      return useMutationNext({
        ...options,
        onSuccess: (_data, { id, mint, parentId }) => {
          // Update any matching comment in any query
          queryClient.setQueriesData<Comment[]>(
            { queryKey: useComments.getKey(mint) },
            (comments: Comment[] = []) =>
              comments.map((comment) =>
                comment._id === id
                  ? {
                      ...comment,
                      likes: comment.likes + 1,
                      hasLiked: true,
                    }
                  : comment,
              ),
          );
          queryClient.setQueriesData<Comment[]>(
            { queryKey: useCommentReplies.getKey(parentId) },
            (comments: Comment[] = []) =>
              comments.map((comment) =>
                comment._id === id
                  ? {
                      ...comment,
                      likes: comment.likes + 1,
                      hasLiked: true,
                    }
                  : comment,
              ),
          );
        },
      });
    },
  ],
});
