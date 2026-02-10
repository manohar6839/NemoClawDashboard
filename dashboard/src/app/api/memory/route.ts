
import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"

export async function GET() {
  try {
    const memoryDir = path.join(process.cwd(), "..", "memory")
    
    // Check if memory dir exists
    try {
        await fs.access(memoryDir)
    } catch {
        return NextResponse.json({ files: [] })
    }

    const files = await fs.readdir(memoryDir)
    
    // Filter for markdown files and sort by date (desc)
    let memoryFiles = files
        .filter(f => f.endsWith(".md"))
        .sort().reverse()
        // Map to metadata
        .map(f => ({
            name: f,
            date: f.replace(".md", ""),
            path: `/memory/${f}`,
            type: "daily"
        }))

    // Check for core "MEMORY.md" in root
    try {
        const rootMemoryPath = path.join(process.cwd(), "..", "MEMORY.md")
        await fs.access(rootMemoryPath)
        memoryFiles = [
            { name: "MEMORY.md", date: "Permanent", path: "/MEMORY.md", type: "core" },
            ...memoryFiles
        ]
    } catch (e) {
        // Ignore if not found
    }

    return NextResponse.json({ 
        files: memoryFiles,
        count: memoryFiles.length,
        latest: memoryFiles[0]
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch memory files" }, { status: 500 })
  }
}
