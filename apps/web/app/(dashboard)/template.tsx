import { PageTransition } from "@/components/motion";
export default function Template({ children }: { children: React.ReactNode }) { return <PageTransition>{children}</PageTransition>; }
