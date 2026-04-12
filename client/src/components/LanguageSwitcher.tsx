import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/contexts/LanguageContext";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  /** Render as a compact icon-only button (for header use) */
  compact?: boolean;
  className?: string;
}

export function LanguageSwitcher({ compact = false, className }: LanguageSwitcherProps) {
  const { language, setLanguage, supportedLanguages } = useLanguage();

  const current = supportedLanguages.find((l) => l.code === language);

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            aria-label="Switch language"
            className={cn(
              "gap-1.5 min-h-[44px] min-w-[44px] px-2.5 text-xs font-medium sm:min-h-8 sm:min-w-0 sm:px-2",
              className,
            )}
            title="Switch language"
          >
            <Languages size={14} />
            <span className="hidden sm:inline">{current?.nativeLabel ?? language}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          {supportedLanguages.map((lang) => (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              className={cn(
                "flex items-center gap-2 cursor-pointer",
                language === lang.code && "font-semibold text-primary"
              )}
            >
              <span className="text-sm">{lang.nativeLabel}</span>
              {language === lang.code && (
                <span className="ml-auto text-xs text-muted-foreground">✓</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Full button for sidebar / settings
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-2", className)}>
          <Languages size={15} />
          {current?.nativeLabel ?? language}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        {supportedLanguages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={cn(
              "flex items-center gap-2 cursor-pointer",
              language === lang.code && "font-semibold text-primary"
            )}
          >
            <span>{lang.nativeLabel}</span>
            <span className="text-xs text-muted-foreground ml-1">({lang.label})</span>
            {language === lang.code && (
              <span className="ml-auto text-xs text-muted-foreground">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
