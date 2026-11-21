import { z } from "zod";

export const faqFieldsSchema = z.object({
  question: z.string().trim().min(1, "Enter a question.").max(300, "Question must be 300 characters or fewer."),
  answer: z.string().trim().min(1, "Enter an answer.").max(2000, "Answer must be 2000 characters or fewer."),
});
