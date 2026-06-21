/** Requirement 9.1: Fixed question set */
import type { Question } from '../entities';
import type { QuestionRepository } from '../types';

const QUESTIONS: Question[] = [
  { id: 'q-delivering-value', title: 'Delivering Value', description: 'How well is the team delivering value to stakeholders?', displayOrder: 1 },
  { id: 'q-team-collaboration', title: 'Team Collaboration', description: 'How effectively does the team work together?', displayOrder: 2 },
  { id: 'q-ease-of-delivery', title: 'Ease of Delivery', description: 'How easy is it to get work done?', displayOrder: 3 },
  { id: 'q-learning-improving', title: 'Learning and Improving', description: 'How well does the team learn from experience?', displayOrder: 4 },
  { id: 'q-psychological-safety', title: 'Psychological Safety', description: 'How safe do team members feel to speak up?', displayOrder: 5 },
];

export class InMemoryQuestionRepository implements QuestionRepository {
  async findAll(): Promise<Question[]> {
    return [...QUESTIONS].sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async findById(id: string): Promise<Question | null> {
    return QUESTIONS.find(q => q.id === id) ?? null;
  }
}
