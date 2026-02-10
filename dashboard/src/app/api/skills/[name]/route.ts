
import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"

// GET /api/skills/[name] - Read SKILL.md
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const skillName = name
    console.log("Fetching skill:", skillName)
    const skillPath = path.join(process.cwd(), "..", "skills", skillName, "SKILL.md")
    console.log("Skill path:", skillPath)
    
    try {
        const content = await fs.readFile(skillPath, "utf-8")
        return NextResponse.json({ content })
    } catch {
        return NextResponse.json({ error: "Skill not found" }, { status: 404 })
    }
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch skill content" }, { status: 500 })
  }
}

// POST /api/skills/[name] - Update SKILL.md
export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const skillName = name
    const body = await request.json()
    const { content } = body

    if (!content) {
        return NextResponse.json({ error: "Missing content" }, { status: 400 })
    }

    const skillPath = path.join(process.cwd(), "..", "skills", skillName, "SKILL.md")
    await fs.writeFile(skillPath, content, "utf-8")

    return NextResponse.json({ success: true, message: "Skill updated" })
  } catch (error) {
    return NextResponse.json({ error: "Failed to update skill" }, { status: 500 })
  }
}
