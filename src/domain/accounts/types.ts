export type HouseholdCountMode = "zero" | "one" | "many";

export type MemberListItem = {
  userId: string;
  membershipId: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "MEMBER" | "GUEST";
  isLastAdmin: boolean;
};

export type AccountProfile = {
  id: string;
  name: string | null;
  email: string;
  birthday: string | null; // YYYY-MM-DD
};
