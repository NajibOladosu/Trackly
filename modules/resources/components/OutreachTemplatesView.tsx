"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Badge } from "@/shared/ui/badge"
import { useToast } from "@/shared/ui/use-toast"
import { Copy } from "lucide-react"
import {
  OUTREACH_TEMPLATES,
  OUTREACH_FIELDS,
  fillTemplate,
  type OutreachVars,
} from "@/modules/resources/lib/outreach"

const EMPTY_VARS: OutreachVars = {
  company: "",
  role: "",
  contact: "",
  yourName: "",
  highlight: "",
}

export function OutreachTemplatesView() {
  const { toast } = useToast()
  const [selectedId, setSelectedId] = useState(OUTREACH_TEMPLATES[0].id)
  const [vars, setVars] = useState<OutreachVars>(EMPTY_VARS)

  const template = useMemo(
    () => OUTREACH_TEMPLATES.find((t) => t.id === selectedId) ?? OUTREACH_TEMPLATES[0],
    [selectedId]
  )

  const filledSubject = fillTemplate(template.subject, vars)
  const filledBody = fillTemplate(template.body, vars)

  const setVar = (key: keyof OutreachVars, value: string) =>
    setVars((prev) => ({ ...prev, [key]: value }))

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: `${label} copied` })
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" })
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      {/* Left: choose template + fill fields */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Choose a template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {OUTREACH_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left rounded-lg border p-3 transition-all ${
                  t.id === selectedId
                    ? "border-primary/60 bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t.name}</span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {t.audience}
                  </Badge>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personalize</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {OUTREACH_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  placeholder={field.placeholder}
                  value={vars[field.key]}
                  onChange={(e) => setVar(field.key, e.target.value)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Right: live preview */}
      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Preview</CardTitle>
          <Button
            size="sm"
            onClick={() => copy(`Subject: ${filledSubject}\n\n${filledBody}`, "Email")}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy email
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <Button variant="ghost" size="sm" className="h-7" onClick={() => copy(filledSubject, "Subject")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-sm font-medium rounded border border-input bg-muted/20 p-2">{filledSubject}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Body</Label>
            <p className="text-sm whitespace-pre-wrap rounded border border-input bg-muted/20 p-3">{filledBody}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Bracketed <span className="font-mono">[fields]</span> show where to fill in details above before sending.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
