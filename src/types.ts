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
