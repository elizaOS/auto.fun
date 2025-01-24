import {
  Comment,
  useCommentReplies,
  useComments,
  useCreateComment,
  useLikeComment,
} from "@/utils/comments";
import { TabsContent } from "@radix-ui/react-tabs";
import { ArrowDown } from "lucide-react";
import { useState } from "react";
import { Spinner } from "@/components/common/Spinner";

const Replies = ({ commentId, mint }: { commentId: string; mint: string }) => {
  const { data: replies = [], isLoading: isRepliesLoading } = useCommentReplies(
    {
      variables: commentId,
      initialData: [],
      refetchInterval: 5000,
    },
  );

  if (isRepliesLoading)
    return (
      <div className="flex justify-center p-4">
        <Spinner />
      </div>
    );

  return (
    <div className="flex flex-col gap-4 pt-6">
      {replies.map((reply) => (
        <CommentItem
          key={reply._id}
          comment={reply}
          allowReply={false}
          mint={mint}
        />
      ))}
    </div>
  );
};

const CommentItem = ({
  comment,
  onReply,
  allowReply,
  mint,
}: {
  comment: Comment;
  onReply?: (parentId: string, message: string) => Promise<void>;
  allowReply: boolean;
  mint: string;
}) => {
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [showReplies, setShowReplies] = useState(false);

  const { mutateAsync: likeComment } = useLikeComment();

  const handleSendReply = async () => {
    await onReply?.(comment._id, replyText);
    setReplyingToId(null);
    setReplyText("");
    setShowReplies(true);
  };

  const handleLike = () => {
    if (!comment.hasLiked) {
      likeComment({ id: comment._id, mint, parentId: comment.parentId });
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-4 mb-2">
        <img
          src="/anonymous.png"
          className="w-10 h-10 rounded-full"
          alt="Anonymous"
        />
        <span className="text-[#22C55E] font-bold">
          {comment.author.slice(0, 4)}...{comment.author.slice(-4)}
        </span>
        <span className="text-[#11632F] text-sm">{comment.timestamp}</span>
      </div>
      <div className="flex flex-col pl-14">
        <p className="text-[#a1a1a1] mb-3">{comment.message}</p>
        <div className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-3">
            {allowReply && (
              <button
                className="text-white text-sm hover:text-gray-200"
                onClick={() => setReplyingToId(comment._id)}
              >
                Reply
              </button>
            )}
            <button
              className="flex items-center gap-1 text-xs font-medium"
              onClick={handleLike}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill={comment.hasLiked ? "white" : "none"}
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M9.465 15.6077C9.21 15.6977 8.79 15.6977 8.535 15.6077C6.36 14.8652 1.5 11.7677 1.5 6.5177C1.5 4.2002 3.3675 2.3252 5.67 2.3252C7.035 2.3252 8.2425 2.9852 9 4.0052C9.7575 2.9852 10.9725 2.3252 12.33 2.3252C14.6325 2.3252 16.5 4.2002 16.5 6.5177C16.5 11.7677 11.64 14.8652 9.465 15.6077Z"
                  stroke="white"
                  strokeWidth="1.125"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {comment.likes}
            </button>
          </div>

          {replyingToId === comment._id && (
            <div>
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write your reply..."
              />
              <button onClick={handleSendReply}>Send</button>
              <button
                onClick={() => {
                  setReplyingToId(null);
                  setReplyText("");
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {comment.replyCount > 0 && (
            <button
              className="flex items-center gap-1 text-[#22C55E] text-sm hover:text-gray-200"
              onClick={() => setShowReplies(!showReplies)}
            >
              <ArrowDown className="w-4 h-4" />
              {showReplies ? "Hide" : "View"} Replies
            </button>
          )}
        </div>
        {showReplies && <Replies commentId={comment._id} mint={mint} />}
      </div>
    </div>
  );
};

export const Comments = ({ tokenId }: { tokenId: string }) => {
  const { data: comments = [], isLoading: isCommentsLoading } = useComments({
    variables: tokenId,
    initialData: [],
    refetchInterval: 5000,
  });
  const { mutateAsync: createComment } = useCreateComment();
  const [commentText, setCommentText] = useState("");

  const handleReply = async (parentId: string, message: string) => {
    await createComment({
      mint: tokenId,
      comment: {
        message,
        parentId,
      },
    });
  };

  const handleNewComment = async (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (commentText.trim()) {
        await createComment({
          mint: tokenId,
          comment: {
            message: commentText,
          },
        });
        setCommentText("");
      }
    }
  };

  if (isCommentsLoading)
    return (
      <div className="flex justify-center pb-4">
        <Spinner />
      </div>
    );

  return (
    <TabsContent className="mt-0" value="comments">
      <textarea
        placeholder="Write your comment..."
        className="w-full bg-[#262626] rounded p-6 text-[#a1a1a1] min-h-[100px] mb-10"
        value={commentText}
        onChange={(e) => setCommentText(e.target.value)}
        onKeyDown={handleNewComment}
      />

      <div className="flex flex-col gap-4">
        {comments.map((comment) => (
          <CommentItem
            key={comment._id}
            comment={comment}
            onReply={handleReply}
            allowReply
            mint={tokenId}
          />
        ))}
      </div>
    </TabsContent>
  );
};
