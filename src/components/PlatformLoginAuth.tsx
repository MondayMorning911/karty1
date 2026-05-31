import React, { useState } from "react";
import { Home } from "lucide-react";
import { AuthAnimation } from "./AuthAnimation";

export const PlatformLoginAuth = ({
  onBack,
  siteKey,
  userId,
}: {
  onBack: () => void;
  siteKey: string;
  userId: string;
}) => {
  const [step, setStep] = useState<"login" | "done">("login");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleNext = async () => {
    setError("");

    if (!login || !password) {
      return setError("Введите логин и пароль");
    }

    setLoading(true);
    try {
      let finalLogin = login.trim();
      if (siteKey === "myhome") {
        // email — отправляем как есть
        const isEmail = finalLogin.includes("@");
        if (!isEmail) {
          // номер — нормализуем код страны
          finalLogin = finalLogin.replace(/[^0-9]/g, "");
          if (finalLogin.startsWith("995")) {
            // уже есть код
          } else {
            finalLogin = "995" + finalLogin;
          }
        }
      }

      const res = await fetch("/api/auth/generic/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, siteKey, login: finalLogin, password }),
      });
      const data = await res.json();

      if (data.status === "success") {
        setStep("done");
      } else {
        setError(data.message || "Неверный логин или пароль");
      }
    } catch (err: any) {
      setError(err.message || "Ошибка сети");
    } finally {
      setLoading(false);
    }
  };

  const getSiteName = () => {
    if (siteKey === "ssge") return "SS.ge";
    if (siteKey === "realting") return "Realting";
    if (siteKey === "myhome") return "MyHome";
    return siteKey;
  };

  const getTheme = () => {
    switch (siteKey) {
      case "ssge":
        return {
          primaryStr: "#2E5BFF",
          btnClass:
            "bg-[#2E5BFF] hover:bg-[#254CE0] text-white shadow-[0_5px_15px_-3px_rgba(46,91,255,0.3)]",
          focusClass:
            "focus:border-[#2E5BFF] focus:ring-1 focus:ring-[#2E5BFF]/30 dark:focus:border-[#2E5BFF]",
          headerClass:
            "bg-white/90 dark:bg-[#0A0A0A]/80 border-b-2 border-[#2E5BFF]",
          headerTextClass:
            "text-[#1A1A1A] dark:text-white font-extrabold tracking-tight",
          backBtnClass:
            "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/80 hover:bg-slate-200 dark:hover:bg-white/20",
          inputClass:
            "bg-[#FFFFFF] dark:bg-black/50 border-slate-300 rounded-none",
        };
      case "realting":
        return {
          primaryStr: "#5BC8C0",
          btnClass:
            "bg-[#E8643A] hover:bg-[#CF5A34] text-white shadow-[0_5px_15px_-3px_rgba(232,100,58,0.3)] tracking-wide",
          focusClass:
            "focus:border-[#5BC8C0] focus:ring-1 focus:ring-[#5BC8C0]/30 dark:focus:border-[#5BC8C0]",
          headerClass:
            "bg-[#5BC8C0] dark:bg-[#5BC8C0]/20 border-b border-[#4AB3AA]",
          headerTextClass: "text-white dark:text-white font-semibold",
          backBtnClass: "bg-white/20 text-white hover:bg-white/30",
          inputClass:
            "bg-[#FFFFFF] dark:bg-black/50 border-slate-200 rounded-lg",
        };
      case "myhome":
        return {
          primaryStr: "#4CAF7D",
          btnClass:
            "bg-[#4CAF7D] border border-[#4CAF7D] hover:bg-[#3D8C64] text-white shadow-sm",
          focusClass:
            "focus:border-[#4CAF7D] focus:ring-1 focus:ring-[#4CAF7D]/30 dark:focus:border-[#4CAF7D]",
          headerClass:
            "bg-[#F5F5F5]/90 dark:bg-[#0A0A0A]/80 border-b border-slate-200 dark:border-white/5",
          headerTextClass: "text-[#333333] dark:text-white font-medium",
          backBtnClass:
            "bg-white dark:bg-white/10 text-[#4A90D9] shadow-sm hover:bg-slate-50 dark:hover:bg-white/20",
          inputClass:
            "bg-[#F5F5F5] dark:bg-[#1A1A1A] border-transparent rounded-xl",
        };
      default:
        return {
          primaryStr: "#533afd",
          btnClass:
            "bg-[#533afd] hover:bg-[#4430e5] text-white shadow-[0_5px_15px_-3px_rgba(83,58,253,0.3)]",
          focusClass: "focus:border-[#533afd] dark:focus:border-[#533afd]",
          headerClass:
            "bg-white/90 dark:bg-[#0A0A0A]/80 border-b border-[#e5edf5] dark:border-white/5",
          headerTextClass: "text-slate-900 dark:text-white font-bold",
          backBtnClass:
            "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/80 hover:bg-slate-200 dark:hover:bg-white/20",
          inputClass:
            "bg-slate-50 dark:bg-black/50 border-slate-200 rounded-xl",
        };
    }
  };

  const theme = getTheme();

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0A0A0A] transition-colors duration-500 relative overflow-hidden text-slate-900 dark:text-white">
      <div
        className="absolute top-[-10%] right-[-10%] w-[60%] h-[40%] blur-[80px] rounded-full pointer-events-none"
        style={{ backgroundColor: `${theme.primaryStr}15` }}
      />
      <div
        className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[40%] blur-[100px] rounded-full pointer-events-none"
        style={{ backgroundColor: `${theme.primaryStr}1A` }}
      />

      <div
        className={`flex items-center px-4 pt-4 pb-4 backdrop-blur-xl z-10 transition-colors ${theme.headerClass}`}
      >
        <button
          onClick={onBack}
          className={`w-8 h-8 flex items-center justify-center rounded-full mr-3 transition-colors ${theme.backBtnClass}`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div>
          <h1
            className={`text-[20px] tracking-tight leading-tight ${theme.headerTextClass}`}
          >
            Вход в {getSiteName()}
          </h1>
        </div>
      </div>

      <div className="flex-1 p-6 z-10 overflow-y-auto">
        <div className="p-6 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl shadow-sm transition-colors">
          {step !== "done" ? (
            <>
              <h2 className="text-lg font-bold mb-4">
                Авторизация {getSiteName()}
              </h2>

              {loading ? (
                <AuthAnimation theme="default" />
              ) : (
                <>
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        {siteKey === "myhome"
                          ? "Email или номер телефона"
                          : siteKey === "ssge"
                            ? "Логин (Email или номер)"
                            : "Логин (Email)"}
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={login}
                          onChange={(e) => setLogin(e.target.value)}
                          placeholder={
                            siteKey === "myhome"
                              ? "example@mail.com или 500355455"
                              : siteKey === "ssge"
                                ? "500355455 или email@mail.com"
                                : "example@mail.com"
                          }
                          className={`w-full px-4 py-3 border dark:border-white/10 outline-none transition-colors ${theme.inputClass} ${theme.focusClass}`}
                          disabled={loading}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        Пароль
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className={`w-full px-4 py-3 border dark:border-white/10 outline-none transition-colors ${theme.inputClass} ${theme.focusClass}`}
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="text-red-500 text-sm mb-4 font-medium">
                      {error}
                    </p>
                  )}

                  <div className="mb-5 p-3 rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20 text-orange-800 dark:text-orange-300 text-xs flex items-start gap-2">
                    <svg
                      className="w-4 h-4 shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                    <p>
                      Мы <b>не храним ваш пароль</b>. Он используется только
                      один раз, сейчас, для создания зашифрованной сессии.
                    </p>
                  </div>

                  <button
                    onClick={handleNext}
                    disabled={loading}
                    className={`w-full py-3.5 rounded-xl font-medium transition-colors disabled:opacity-70 flex items-center justify-center ${theme.btnClass}`}
                  >
                    Войти в аккаунт
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <p className="font-bold text-lg">Успешно подключено!</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 mb-6">
                Связь с {getSiteName()} установлена, вы можете публиковать
                объекты.
              </p>

              <button
                onClick={onBack}
                className="w-full py-3.5 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 rounded-xl font-medium transition-colors"
              >
                Вернуться к площадкам
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Karty безопасно шифрует данные и использует их напрямую для связи с{" "}
          {getSiteName()}.
        </p>
      </div>
    </div>
  );
};
