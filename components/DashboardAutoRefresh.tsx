"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    router.refresh();

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }

    function refreshWhenFocused() {
      router.refresh();
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenFocused);

    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenFocused);
    };
  }, [router]);

  return null;
}
