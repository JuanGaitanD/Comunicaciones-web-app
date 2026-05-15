export type Mood = 'feliz' | 'enojado' | 'frustrado' | 'perdido' | 'enamorado' | 'emocionado' | 'none';

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  email: string;
  theme?: 'default' | 'ocean' | 'sunset' | 'forest';
  isDarkMode?: boolean;
  avatarConfig?: {
    skinColor?: string;
    top?: string;
    clothes?: string;
    mouth?: string;
    eyes?: string;
    backgroundColor?: string;
  };
}

export interface Call {
  id: string;
  name: string;
  creatorId: string;
  createdAt: string;
  status: 'active' | 'ended';
  lastActiveAt?: string;
  visibility: 'public' | 'private';
  inviteCode?: string | null;
}

export interface CallMessage {
  id: string;
  call_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Participant {
  uid: string;
  displayName: string;
  photoURL: string;
  joinedAt: string;
  mood: Mood;
  isMuted: boolean;
  volume?: number; // Local volume for this participant (not synced)
}

export interface Signal {
  from: string;
  to: string;
  type: 'offer' | 'answer' | 'candidate';
  data: string;
  timestamp: string;
}

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export interface Friendship {
  user_a_id: string;
  user_b_id: string;
  status: FriendshipStatus;
  requested_by: string;
  created_at: string;
  updated_at: string;
}

export interface FriendWithProfile {
  friendship: Friendship;
  otherUid: string;
  otherProfile: {
    displayName: string;
    photoURL: string;
  };
}

export interface DMThread {
  id: string;
  user_a_id: string;
  user_b_id: string;
  created_at: string;
  last_message_at: string;
}

export interface DMMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}
