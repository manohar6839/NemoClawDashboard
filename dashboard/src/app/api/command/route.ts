
import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import { v4 as uuidv4 } from "uuid"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { command, args } = body

    if (!command) {
        return NextResponse.json({ error: "Missing command" }, { status: 400 })
    }

    const commandId = uuidv4()
    const commandDir = path.join(process.cwd(), "..", "commands")
    
    // Ensure command dir exists
    await fs.mkdir(commandDir, { recursive: true })

    const commandFile = {
        id: commandId,
        timestamp: new Date().toISOString(),
        command,
        args: args || {},
        status: "pending"
    }

    const filePath = path.join(commandDir, `${commandId}.json`)
    await fs.writeFile(filePath, JSON.stringify(commandFile, null, 2))

    return NextResponse.json({ 
        success: true,
        id: commandId,
        message: "Command queued"
    })
  } catch (error) {
    console.error("Command error:", error)
    return NextResponse.json({ error: "Failed to queue command" }, { status: 500 })
  }
}
