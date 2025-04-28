import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import {
  useProfile,
  useUserProfile,
  updateUserProfile,
  UserProfileData,
  uploadProfilePicture,
  generateProfilePicture,
} from "../utils/profileUtils";
import { TokenTable } from "../components/token-table";
import { useWallet } from "@solana/wallet-adapter-react";
import { env } from "../utils/env";
import Loader from "@/components/loader";
import Button from "@/components/button";
import { Link, useParams } from "react-router";
import {
  ExternalLink,
  User,
  Save,
  XCircle,
  Upload,
  Zap,
  Edit2,
  Check,
} from "lucide-react";
import { toast } from "react-toastify";

interface EditableProfileHeaderProps {
  user: UserProfileData | null;
  isCurrentUser: boolean;
  isEditingName: boolean;
  setIsEditingName: (value: boolean) => void;
  editingDisplayName: string;
  setEditingDisplayName: (value: string) => void;
  editingProfilePictureUrl: string;
  onSaveName: () => void;
  onCancelNameEdit: () => void;
  onUploadClick: () => void;
  onGenerateClick: () => void;
  isUploading: boolean;
  isGenerating: boolean;
  isSaving: boolean;
  editError: string | null;
}

const EditableProfileHeader = ({
  user,
  isCurrentUser,
  isEditingName,
  setIsEditingName,
  editingDisplayName,
  setEditingDisplayName,
  editingProfilePictureUrl,
  onSaveName,
  onCancelNameEdit,
  onUploadClick,
  onGenerateClick,
  isUploading,
  isGenerating,
  isSaving,
  editError,
}: EditableProfileHeaderProps) => {
  if (!user) return null;

  const displayImageUrl = editingProfilePictureUrl;

  return (
    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8 mx-auto mb-12">
      <div className="flex-shrink-0 flex flex-col items-center gap-2 w-48">
        <div className="relative w-48 h-48">
          {isUploading || isGenerating ? (
            <div className="w-full h-full flex items-center justify-center">
              {isUploading && "Uploading..."}
              {isGenerating && "Generating..."}
            </div>
          ) : displayImageUrl ? (
            <img
              src={displayImageUrl}
              alt="Profile preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = "/default-avatar.png";
                e.currentTarget.onerror = null;
                console.warn(
                  "Failed to load profile picture URL:",
                  displayImageUrl,
                );
              }}
            />
          ) : (
            <div className="w-full h-full rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center">
              <User className="text-neutral-400 w-10 h-10" />
            </div>
          )}
        </div>

        {isCurrentUser && (
          <div className="flex gap-1.5 w-full">
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={onUploadClick}
              disabled={isUploading || isGenerating || isSaving}
              className="w-full flex items-center justify-center gap-1 text-xs px-2 py-1"
            >
              {isUploading ? "Uploading..." : <Upload className="w-3 h-3" />}
              Upload
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={onGenerateClick}
              disabled={isUploading || isGenerating || isSaving}
              className="w-full flex items-center justify-center gap-1 text-xs px-2 py-1"
            >
              {isGenerating ? "Generating..." : <Zap className="w-3 h-3" />}
              {!isGenerating && "Generate"}
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-3">
        <div className="flex items-center gap-2 group min-h-[40px]">
          {isCurrentUser && isEditingName ? (
            <>
              <input
                id="displayName"
                type="text"
                value={editingDisplayName}
                onChange={(e) => setEditingDisplayName(e.target.value)}
                placeholder="Enter Display Name"
                className="flex-grow text-white text-2xl font-medium bg-neutral-800 border border-neutral-700 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-autofun-background-action-highlight"
                required
                maxLength={50}
                disabled={isSaving}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSaveName();
                  if (e.key === "Escape") onCancelNameEdit();
                }}
              />
              <Button
                variant="ghost"
                onClick={onSaveName}
                disabled={isSaving || !editingDisplayName}
                className="text-green-400 hover:text-green-300 p-1"
                aria-label="Save name"
              >
                {isSaving ? (
                  <Loader className="w-4 h-4" />
                ) : (
                  <Check className="w-5 h-5" />
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={onCancelNameEdit}
                disabled={isSaving}
                className="text-red-400 hover:text-red-300 p-1"
                aria-label="Cancel edit name"
              >
                <XCircle className="w-5 h-5" />
              </Button>
            </>
          ) : (
            <>
              <h1 className="text-white text-2xl font-medium break-all">
                {user.displayName || "Unnamed User"}
              </h1>
              {isCurrentUser && (
                <Button
                  variant="ghost"
                  onClick={() => setIsEditingName(true)}
                  className="text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                  aria-label="Edit name"
                >
                  <Edit2 className="w-5 h-5" />
                </Button>
              )}
            </>
          )}
        </div>

        {/* Points Display */}
        <div className="text-neutral-400 text-sm font-medium mt-1">
          Points: {user.points ?? 0}
        </div>

        {/* Wallet Address (Always shown) */}
        <div className="py-2 flex gap-4">
          {/* Wallet Address content */}
          <div className="text-[#8c8c8c] text-base font-normal leading-normal truncate">
            {user.address}
          </div>
          <Link
            to={env.getWalletUrl(user.address)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="visit profile"
          >
            <ExternalLink className="text-[#8C8C8C] size-5" />
          </Link>
        </div>

        {isCurrentUser && editError && (
          <div className="mt-1 p-2 bg-red-900/30 border border-red-800 text-red-200 text-sm">
            {editError}
          </div>
        )}
      </div>
    </div>
  );
};

type Tab = "held" | "created";

export default function Profile() {
  const [selectedTab, setSelectedTab] = useState<Tab>("held");

  const { address } = useParams<{ address?: string }>();
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58();

  const targetAddress = address || walletAddress;
  const isCurrentUser = targetAddress === walletAddress;

  const {
    data: currentUserProfileData,
    isLoading: isCurrentUserLoading,
    refetch: refetchCurrentUserProfile,
  } = useProfile();

  const {
    profileData: otherUserProfileData,
    isLoading: isOtherUserLoading,
    refetch: refetchOtherUserProfile,
  } = useUserProfile(!isCurrentUser ? targetAddress : null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState("");
  const [editingProfilePictureUrl, setEditingProfilePictureUrl] = useState("");
  const [isSubmittingName, setIsSubmittingName] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingPic, setIsGeneratingPic] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoading = isCurrentUser ? isCurrentUserLoading : isOtherUserLoading;
  const fetchedUserData = isCurrentUser
    ? currentUserProfileData?.user
    : otherUserProfileData?.user;

  useEffect(() => {
    if (isCurrentUser && fetchedUserData) {
      if (!isEditingName) {
        setEditingDisplayName(fetchedUserData.displayName || "");
      }
      setEditingProfilePictureUrl(fetchedUserData.profilePictureUrl || "");
    } else {
      setEditingDisplayName("");
      setEditingProfilePictureUrl("");
      setIsEditingName(false);
    }
  }, [isCurrentUser, fetchedUserData]);

  const profileData = useMemo(() => {
    if (isCurrentUser) {
      return {
        user: currentUserProfileData.user,
        tokensCreated: currentUserProfileData.tokensCreated,
        tokensHeld: currentUserProfileData.tokensHeld,
      };
    } else {
      return {
        user: otherUserProfileData?.user || null,
        tokensCreated: otherUserProfileData?.tokensCreated || [],
        tokensHeld: [],
      };
    }
  }, [isCurrentUser, currentUserProfileData, otherUserProfileData]);

  const tableTokens = useMemo(() => {
    if (!isCurrentUser) {
      return profileData.tokensCreated;
    }
    switch (selectedTab) {
      case "created":
        return profileData.tokensCreated;
      case "held":
        return profileData.tokensHeld;
    }
  }, [
    selectedTab,
    profileData.tokensCreated,
    profileData.tokensHeld,
    isCurrentUser,
  ]);

  const handleProfileUpdateNeeded = useCallback(() => {
    if (isCurrentUser && refetchCurrentUserProfile) {
      refetchCurrentUserProfile();
    } else if (!isCurrentUser && refetchOtherUserProfile) {
      refetchOtherUserProfile();
    }
  }, [isCurrentUser, refetchCurrentUserProfile, refetchOtherUserProfile]);

  const handleSaveName = async () => {
    if (!isCurrentUser) return;
    setIsSubmittingName(true);
    setEditError(null);
    try {
      await updateUserProfile(editingDisplayName, undefined);
      toast.success("Display name updated!");
      setIsEditingName(false);
      handleProfileUpdateNeeded();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update display name";
      setEditError(message);
      toast.error(message);
    } finally {
      setIsSubmittingName(false);
    }
  };

  const handleCancelNameEdit = () => {
    if (!isCurrentUser || !fetchedUserData) return;
    setEditingDisplayName(fetchedUserData.displayName || "");
    setIsEditingName(false);
    setEditError(null);
  };

  const handleFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!isCurrentUser) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setEditError(null);
    try {
      const updatedUser = await uploadProfilePicture(file);
      setEditingProfilePictureUrl(updatedUser.profilePictureUrl || "");
      toast.success("Profile picture uploaded!");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to upload profile picture.";
      setEditError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleGeneratePicture = async () => {
    if (!isCurrentUser) return;
    setIsGeneratingPic(true);
    setEditError(null);
    try {
      const updatedUser = await generateProfilePicture();
      setEditingProfilePictureUrl(updatedUser.profilePictureUrl || "");
      toast.success("New profile picture generated!");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to generate profile picture.";
      setEditError(message);
      toast.error(message);
    } finally {
      setIsGeneratingPic(false);
    }
  };

  if (!targetAddress && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 mt-32 text-neutral-400">
        Connect wallet to view your profile.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1 mt-32 m-auto items-center">
        <Loader />
      </div>
    );
  }

  if (!profileData.user) {
    return (
      <div className="flex flex-col flex-1 mt-32 m-auto items-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 mt-32 m-auto">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelected}
        accept="image/png, image/jpeg, image/gif, image/webp"
        style={{ display: "none" }}
        disabled={isUploading || isGeneratingPic || isSubmittingName}
      />

      <EditableProfileHeader
        user={profileData.user}
        isCurrentUser={isCurrentUser}
        isEditingName={isEditingName}
        setIsEditingName={setIsEditingName}
        editingDisplayName={editingDisplayName}
        setEditingDisplayName={setEditingDisplayName}
        editingProfilePictureUrl={editingProfilePictureUrl}
        onSaveName={handleSaveName}
        onCancelNameEdit={handleCancelNameEdit}
        onUploadClick={triggerFileUpload}
        onGenerateClick={handleGeneratePicture}
        isUploading={isUploading}
        isGenerating={isGeneratingPic}
        isSaving={isSubmittingName}
        editError={editError}
      />

      <div className="flex justify-end gap-2.5 mb-4">
        {isCurrentUser && (
          <Button
            variant={selectedTab === "held" ? "tab" : "outline"}
            onClick={() => setSelectedTab("held")}
          >
            Coins Held
          </Button>
        )}
        <Button
          variant={selectedTab === "created" ? "tab" : "outline"}
          onClick={() => setSelectedTab("created")}
        >
          Coins Created
        </Button>
      </div>

      {isCurrentUserLoading ? (
        <div className="flex justify-center items-center min-h-[200px]">
          <Loader />
        </div>
      ) : (
        <TokenTable tokens={tableTokens} />
      )}
    </div>
  );
}
