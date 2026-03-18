// Finance Mini App - Income/Expense Tracker

interface Transaction {
  id: number;
  userId: number;
  type: "income" | "expense";
  category: string;
  amount: number;
  description: string;
  date: Date;
}

interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  transactions: Transaction[];
}

export const addTransaction = (
  userId: number,
  type: "income" | "expense",
  category: string,
  amount: number,
  description: string
): Transaction => {
  // TODO: DB insert
  return {
    id: 1,
    userId,
    type,
    category,
    amount,
    description,
    date: new Date(),
  };
};

export const getFinanceSummary = (userId: number): FinanceSummary => {
  // TODO: DB query
  return {
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    transactions: [],
  };
};

export const getMonthlyReport = (userId: number, month: number, year: number) => {
  // TODO: Generate report
  return {
    month,
    year,
    income: 0,
    expense: 0,
    categories: {},
  };
};
