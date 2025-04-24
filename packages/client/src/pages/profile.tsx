import { useMemo, useState } from "react";
import { useProfile, useUserProfile, updateUserProfile, UserProfileData } from "../utils/profileUtils";
import { TokenTable } from "../components/token-table";
import { useWallet } from "@solana/wallet-adapter-react";
import { env } from "../utils/env";
import Loader from "@/components/loader";
import Button from "@/components/button";
import { Link, useParams } from "react-router";
import { ExternalLink, Edit2, User, X } from "lucide-react";

interface ProfileHeaderProps {
  user: UserProfileData | null;
  isCurrentUser: boolean;
  onEdit: () => void;
}

const ProfileHeader = ({ user, isCurrentUser, onEdit }: ProfileHeaderProps) => {
  if (!user) return null;

  return (
    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 p-6 bg-neutral-900 border border-neutral-800 mb-[28px]">
      <div className="flex-shrink-0">
        {user.profilePictureUrl ? (
          <img
            src={user.profilePictureUrl}
            alt={user.displayName}
            className="w-20 h-20 rounded-full object-cover"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-neutral-800 flex items-center justify-center">
            <User className="text-neutral-400 w-10 h-10" />
          </div>
        )}
      </div>
      <div className="flex-1">
        <div className="text-white text-xl font-medium mb-1">
          {user.displayName}
        </div>
        <div className="px-3 py-2 bg-[#212121] border border-neutral-800 flex justify-between items-center gap-4 mb-2">
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
        {isCurrentUser && (
          <Button onClick={onEdit} variant="outline" className="flex items-center gap-2">
            <Edit2 className="w-4 h-4" />
            Edit Profile
          </Button>
        )}
      </div>
    </div>
  );
};

interface EditProfileModalProps {
  user: UserProfileData;
  onClose: () => void;
  onSave: (name: string, pictureUrl: string | null) => Promise<void>;
}

const EditProfileModal = ({ user, onClose, onSave }: EditProfileModalProps) => {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [profilePictureUrl, setProfilePictureUrl] = useState(user.profilePictureUrl || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      await onSave(
        displayName, 
        profilePictureUrl.trim() === "" ? null : profilePictureUrl
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-md max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white text-xl font-medium">Edit Profile</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="displayName" className="block text-neutral-300 mb-2">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 text-white rounded-md focus:outline-none focus:ring-1 focus:ring-autofun-background-action-highlight"
              required
              maxLength={50}
            />
          </div>

          <div className="mb-6">
            <label htmlFor="profilePictureUrl" className="block text-neutral-300 mb-2">
              Profile Picture URL
            </label>
            <input
              id="profilePictureUrl"
              type="url"
              value={profilePictureUrl}
              onChange={(e) => setProfilePictureUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 text-white rounded-md focus:outline-none focus:ring-1 focus:ring-autofun-background-action-highlight"
            />
            <p className="text-xs text-neutral-500 mt-1">Leave blank to remove profile picture</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-200 rounded-md">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader className="w-4 h-4" /> : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

type Tab = "held" | "created";

export default function Profile() {
  const [selectedTab, setSelectedTab] = useState<Tab>("held");
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  
  // Get address from URL or use connected wallet
  const { address } = useParams<{ address?: string }>();
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58();
  
  // Determine which address to show profile for
  const targetAddress = address || walletAddress;
  const isCurrentUser = targetAddress === walletAddress;
  
  // For current user, use the full profile with tokens held
  const { data: currentUserProfile, isLoading: isCurrentUserLoading } = useProfile();
  
  // For other users, just fetch their profile data
  const { profileData: otherUserProfile, isLoading: isOtherUserLoading } = useUserProfile(
    !isCurrentUser ? targetAddress : null
  );
  
  // Combine the data based on which user we're viewing
  const isLoading = isCurrentUser ? isCurrentUserLoading : isOtherUserLoading;
  const profileData = isCurrentUser
    ? {
        user: currentUserProfile.user,
        tokensCreated: currentUserProfile.tokensCreated,
        tokensHeld: currentUserProfile.tokensHeld,
      }
    : {
        user: otherUserProfile?.user || null,
        tokensCreated: otherUserProfile?.tokensCreated || [],
        tokensHeld: [], // Don't show tokens held for other users
      };
  
  const tableTokens = useMemo(() => {
    // If viewing another user's profile, only show created tokens
    if (!isCurrentUser) {
      return profileData.tokensCreated;
    }
    
    // For current user, show the selected tab
    switch (selectedTab) {
      case "created":
        return profileData.tokensCreated;
      case "held":
        return profileData.tokensHeld;
    }
  }, [selectedTab, profileData.tokensCreated, profileData.tokensHeld, isCurrentUser]);

  // Handle profile update
  const handleSaveProfile = async (displayName: string, profilePictureUrl: string | null) => {
    try {
      await updateUserProfile(displayName, profilePictureUrl);
      // Refresh the profile data
      window.location.reload();
    } catch (error) {
      console.error("Failed to update profile:", error);
      throw error;
    }
  };

  // Show loading state if no target address yet
  if (!targetAddress) {
    return (
      <div className="flex flex-col flex-1 mt-32 max-w-4xl w-full m-auto">
        <div className="flex justify-center items-center min-h-[200px]">
          <Loader />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 mt-32 max-w-4xl w-full m-auto">
      <div className="text-white text-[32px] font-medium leading-9 mb-6 font-satoshi">
        {isCurrentUser ? "Your Profile" : "User Profile"}
      </div>
      
      {/* Profile Header with user info */}
      <ProfileHeader 
        user={profileData.user} 
        isCurrentUser={isCurrentUser}
        onEdit={() => setIsEditProfileOpen(true)}
      />
      
      {/* Edit Profile Modal */}
      {isEditProfileOpen && profileData.user && (
        <EditProfileModal
          user={profileData.user}
          onClose={() => setIsEditProfileOpen(false)}
          onSave={handleSaveProfile}
        />
      )}
      
      {/* Tabs - only show tokens held tab for current user */}
      <div className="flex gap-2.5 mb-4">
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

      {isLoading ? (
        <div className="flex justify-center items-center min-h-[200px]">
          <Loader />
        </div>
      ) : (
        <TokenTable tokens={tableTokens} />
      )}
    </div>
  );
}
