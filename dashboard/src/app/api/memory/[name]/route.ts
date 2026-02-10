
import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"

// GET /api/memory/[name] - Read specific memory file
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    // Security: Prevent directory traversal
    const safeName = path.basename(name)
    console.log("Fetching memory:", safeName)
    
    // Handle root MEMORY.md vs others
    let memoryPath
    if (safeName === "MEMORY.md") {
        memoryPath = path.join(process.cwd(), "..", "MEMORY.md")
    } else {
        memoryPath = path.join(process.cwd(), "..", "memory", safeName)
    }
    
    try {
        const content = await fs.readFile(memoryPath, "utf-8")
        return NextResponse.json({ content })
    } catch (e) {
        console.error(e)
        return NextResponse.json({ error: "Memory file not found" }, { status: 404 })
    }
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch memory content" }, { status: 500 })
  }
}

// POST /api/memory/[name] - Update memory file
export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const safeName = path.basename(name)
    const body = await request.json()
    const { content } = body

    if (content === undefined) {
        return NextResponse.json({ error: "Missing content" }, { status: 400 })
    }

    // Handle root MEMORY.md vs others
    let memoryPath
    if (safeName === "MEMORY.md") {
        memoryPath = path.join(process.cwd(), "..", "MEMORY.md")
    } else {
        memoryPath = path.join(process.cwd(), "..", "memory", safeName)
    }

    await fs.writeFile(memoryPath, content, "utf-8")

    return NextResponse.json({ success: true, message: "Memory updated" })
  } catch (error) {
    return NextResponse.json({ error: "Failed to update memory" }, { status: 500 })
  }
}
