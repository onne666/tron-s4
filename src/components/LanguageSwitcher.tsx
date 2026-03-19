import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_LANGUAGES } from "@/i18n/resources";
import { normalizeLanguage } from "@/i18n/config";

const LanguageSwitcher = () => {
  const { t, i18n } = useTranslation();
  const currentLanguage = normalizeLanguage(i18n.resolvedLanguage);

  return (
    <Select value={currentLanguage} onValueChange={(value) => void i18n.changeLanguage(value)}>
      <SelectTrigger
        aria-label={t("languageSwitcher.label")}
        className="h-10 w-[8.5rem] rounded-full border-border bg-card/80 text-xs text-foreground shadow-[0_0_24px_hsl(var(--primary)/0.08)]"
      >
        <div className="flex items-center gap-2">
          <Languages className="h-3.5 w-3.5 text-primary" />
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent className="border-border bg-popover/95 backdrop-blur-md">
        {SUPPORTED_LANGUAGES.map((language) => (
          <SelectItem key={language.code} value={language.code}>
            {language.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default LanguageSwitcher;
