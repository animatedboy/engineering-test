import { NextFunction, Request, Response } from "express"
import { getRepository, createQueryBuilder } from "typeorm"
import { Group } from "../entity/group.entity"
import { GroupStudent } from "../entity/group-student.entity"
import { Student } from "../entity/student.entity"
import { StudentRollState } from "../entity/student-roll-state.entity"
import { Roll } from "../entity/roll.entity"
import { CreateGroupInput, UpdateGroupInput } from "../interface/group.interface"
import * as moment from "moment"

export class GroupController {
  private groupRepository = getRepository(Group)
  private groupStudentRepository = getRepository(GroupStudent)
  private studentRepository = getRepository(Student)
  private studentRollStateRepo = getRepository(StudentRollState)
  private rollRepo = getRepository(Roll)

  async allGroups(request: Request, response: Response, next: NextFunction) {
    try {
      return await this.groupRepository.find()
    } catch (e) {
      response.status(500).json({ error: e.message })
    }
  }

  async allGroupStudent(request: Request, response: Response, next: NextFunction) {
    return this.groupStudentRepository.find()
  }

  async createGroup(request: Request, response: Response, next: NextFunction) {
    const { body: params } = request

    const createGroupInput: CreateGroupInput = {
      name: params.name,
      number_of_weeks: params.number_of_weeks,
      roll_states: params.roll_states,
      incidents: params.incidents,
      ltmt: params.ltmt,
    }
    const group = new Group()
    group.prepareToCreate(createGroupInput)

    try {
      return await this.groupRepository.save(group)
    } catch (e) {
      response.status(500).json({ error: e.message })
    }
  }

  async updateGroup(request: Request, response: Response, next: NextFunction) {
    const { body: params } = request
    try {
      let group = await this.groupRepository.findOne(params.id)
      const updateGroupInput: UpdateGroupInput = {
        id: params.id,
        name: params.name,
        number_of_weeks: params.number_of_weeks,
        roll_states: params.roll_states,
        incidents: params.incidents,
        ltmt: params.ltmt,
      }
      group.prepareToUpdate(updateGroupInput)

      return this.groupRepository.save(group)
    } catch (e) {
      response.status(500).json({ error: e.message })
    }
  }

  async removeGroup(request: Request, response: Response, next: NextFunction) {
    try {
      let groupToRemove = await this.groupRepository.findOne(request.params.id)
      return this.groupRepository.remove(groupToRemove)
    } catch (e) {
      response.status(500).json({ error: e.message })
    }
  }

  async getGroupStudents(request: Request, response: Response, next: NextFunction) {
    try {
      const students = await this.studentRepository
        .createQueryBuilder("student")
        .innerJoin(GroupStudent, "groupStudent", "student.id=groupStudent.student_id")
        .where("groupStudent.group_id=:id", {
          id: request.params.id,
        })
        .select(["student.id AS id", "student.first_name AS first_name", "student.last_name AS last_name"])
        .addSelect("student.first_name || ' ' || student.last_name", "full_name")
        .getRawMany()
      return students
    } catch (e) {
      response.status(500).json({ error: e.message })
    }
  }

  async runGroupFilters(request: Request, response: Response, next: NextFunction) {
    try {
      await this.groupStudentRepository.remove(await this.groupStudentRepository.find())

      let groups = await this.groupRepository.find()
      let groupStudents = []
      // SELECT student.student_id ,SUM(student.student_id) as incident from student_roll_state student inner join roll roll ON student.roll_id = roll.id where

      for (const group of groups) {
        let pastWeek = moment()
          .date(group.number_of_weeks * -7)
          .toISOString()
        let today = new Date().toISOString()
        let filterResult = await this.studentRollStateRepo
          .createQueryBuilder("studentrollstate")
          .innerJoin(Roll, "roll", "studentrollstate.student_id = roll.id and roll.completed_at between :dt and :now", { dt: pastWeek, now: today })
          .where(`instr('${group.roll_states}',studentrollstate.state)`)
          .select("studentrollstate.student_id", "student_id")
          .addSelect("COUNT(studentrollstate.student_id)", "incident_count")
          .groupBy("student_id")
          .having(`incident_count ${group.ltmt} :groupIncident`, { groupIncident: group.incidents })
          .getRawMany()

        if (filterResult.length) {
          group.student_count = filterResult.length
          group.run_at = new Date()
        } else {
          group.student_count = 0
          group.run_at = new Date()
        }

        filterResult.forEach((result) => {
          result.group_id = group.id
        })

        groupStudents = groupStudents.concat(filterResult)
      }

      await this.groupStudentRepository.save(groupStudents)
      return await this.groupRepository.save(groups)
    } catch (e) {
      response.status(500).json({ error: e.message })
    }
  }
}
