
import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"

export async function GET() {
  try {
    const skillsDir = path.join(process.cwd(), "..", "skills")
    
    // Check if skills dir exists
    try {
        await fs.access(skillsDir)
    } catch {
        return NextResponse.json({ skills: [] })
    }

    const dirents = await fs.readdir(skillsDir, { withFileTypes: true })
    const skills = dirents
        .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith("."))
        .map(dirent => ({
            name: dirent.name,
            path: `/skills/${dirent.name}`,
            description: "Custom skill" // Could read from SKILL.md if we wanted to be fancy later
        }))

    return NextResponse.json({ 
        skills: skills,
        count: skills.length
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch skills" }, { status: 500 })
  }
}
