export type LoadCategory =
  | "Mind racing"
  | "Body heavy"
  | "Expectations"
  | "Brain Fog"
  | "Everything feels heavy"
  | "I feel a little okay today";

export type Capacity = "Very low" | "Low" | "Some";

export type Choice = {
  capacity: Capacity;
  load: LoadCategory | null;
  boundary: string;
};

export type Step = "welcome" | "capacity" | "load" | "boundary" | "result";
