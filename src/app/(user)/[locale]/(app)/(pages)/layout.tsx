import Header from "@/client/features/layout/Header";

type Props = {
  children: React.ReactNode;
};

export default function PagesLayout({ children }: Props) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-[640px] flex-1 px-5">
        {children}
      </main>
    </>
  );
}
